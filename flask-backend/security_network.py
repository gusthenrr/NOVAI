"""Outbound boundaries: fixed ML API origin and DNS-pinned public page reads."""
import ipaddress
import re
import socket
from urllib.parse import urljoin, urlsplit

import requests as http
import urllib3

from precify_core import ApiError

API_HOST = 'api.mercadolibre.com'
PAGE_HOSTS = frozenset({'www.mercadolivre.com.br', 'produto.mercadolivre.com.br', 'lista.mercadolivre.com.br', 'mercadolivre.com.br'})
TOPICS = {
    'items': r'/items/MLB\d{6,15}',
    'questions': r'/questions/\d{1,30}',
    'orders_v2': r'/orders/\d{1,30}',
    'messages': r'/messages/[A-Za-z0-9_-]{1,120}',
    'post_purchase': r'/(?:post-purchase/v1/claims|claims)/\d{1,30}',
    'public_offers': r'/seller-promotions/(?:offers|promotions)/[A-Za-z0-9_-]{1,120}',
}


def official_resource_url(resource, topic=None):
    if topic=='messages' and isinstance(resource,str) and re.fullmatch(r'[A-Za-z0-9_-]{1,120}',resource): resource='/messages/'+resource
    if topic=='post_purchase' and isinstance(resource,str) and resource.startswith('post-purchase/v1/claims/'): resource='/'+resource
    if not isinstance(resource, str) or len(resource)>512 or not re.fullmatch(r'/[A-Za-z0-9_/-]+',resource) or '//' in resource:
        raise ApiError('invalid_notification_resource')
    if topic is not None and (topic not in TOPICS or not re.fullmatch(TOPICS[topic],resource)):
        raise ApiError('invalid_notification_resource')
    return 'https://'+API_HOST+resource


class MercadoLivreHTTP:
    """Legacy API calls cannot follow redirects or carry credentials to another host."""
    exceptions=http.exceptions
    Timeout=http.Timeout
    RequestException=http.RequestException

    def request(self, method, url, **kwargs):
        try:
            parsed=urlsplit(url)
            valid=parsed.scheme=='https' and parsed.hostname==API_HOST and parsed.port in (None,443) and not parsed.username and not parsed.password
        except (ValueError,TypeError): valid=False
        if not valid:
            raise ApiError('upstream_origin_rejected')
        kwargs['allow_redirects']=False
        kwargs.setdefault('timeout',(3,12))
        # Ignore ambient proxy/netrc settings when transmitting account credentials.
        with http.Session() as session:
            session.trust_env=False
            return session.request(method,url,**kwargs)

    def get(self,url,**kwargs): return self.request('GET',url,**kwargs)
    def post(self,url,**kwargs): return self.request('POST',url,**kwargs)
    def put(self,url,**kwargs): return self.request('PUT',url,**kwargs)
    def delete(self,url,**kwargs): return self.request('DELETE',url,**kwargs)


ml_http=MercadoLivreHTTP()


def validate_page_url(url):
    try:
        parsed=urlsplit(url)
        if len(url)>4096 or parsed.scheme!='https' or parsed.hostname not in PAGE_HOSTS or parsed.port not in (None,443) or parsed.username or parsed.password or '\\' in url or any(ord(c)<32 for c in url):
            raise ValueError()
        return parsed
    except (TypeError,ValueError):
        raise ApiError('invalid_product_url') from None


def fetch_product_html(url, headers=None):
    # Resolve and pin the address in the connection, while retaining original TLS
    # SNI/certificate verification. Checking DNS then letting requests resolve again
    # would leave a DNS-rebinding gap.
    for _ in range(4):
        parsed=validate_page_url(url)
        try:
            records=socket.getaddrinfo(parsed.hostname,443,type=socket.SOCK_STREAM)
            addresses=list(dict.fromkeys(record[4][0] for record in records))
            if not addresses or any(not ipaddress.ip_address(a).is_global for a in addresses):
                raise ApiError('private_address_rejected')
            request_headers={'Host':parsed.hostname,'User-Agent':'Mozilla/5.0','Accept':'text/html','Accept-Language':'pt-BR'}
            pool=urllib3.HTTPSConnectionPool(addresses[0],port=443,server_hostname=parsed.hostname,
                assert_hostname=parsed.hostname,cert_reqs='CERT_REQUIRED',timeout=urllib3.Timeout(connect=3,read=8),retries=False)
            with pool:
                response=pool.urlopen('GET',parsed.path+('?' + parsed.query if parsed.query else '') or '/',
                    headers=request_headers,redirect=False,preload_content=False)
                try:
                    if response.status in (301,302,303,307,308):
                        location=response.headers.get('Location')
                        if not location: raise ApiError('invalid_product_redirect',502)
                        url=urljoin(url,location)
                        continue
                    if response.status!=200: raise ApiError('product_unavailable',502)
                    content=response.read(2*1024*1024+1)
                    if len(content)>2*1024*1024: raise ApiError('product_response_too_large',502)
                    return content.decode('utf-8',errors='replace')
                finally: response.close()
        except (OSError,urllib3.exceptions.HTTPError):
            raise ApiError('product_unavailable',502) from None
    raise ApiError('too_many_redirects',502)
