"""Public release metadata only; publish after the build reaches its tester group."""
import json
import re

NUMBER = re.compile(r'(?:0|[1-9]\d{0,8})(?:\.(?:0|[1-9]\d{0,8})){0,2}\Z')
VERSION = re.compile(r'\d{1,6}\.\d{1,6}\.\d{1,6}\Z')
TARGETS = {
    ('ios', 'testflight'): re.compile(r'https://testflight\.apple\.com/join/[A-Za-z0-9]{8}\Z'),
    ('ios', 'store'): re.compile(r'https://apps\.apple\.com/(?:[a-z]{2}/)?app/(?:[A-Za-z0-9-]+/)?id\d+\Z'),
    ('android', 'store'): re.compile(r'https://play\.google\.com/store/apps/details\?id=com\.precificador\.app\Z'),
    ('android', 'apk'): re.compile(r'https://expo\.dev/artifacts/eas/[A-Za-z0-9_-]+\.apk\Z'),
}


def public_release(raw, platform, channel):
    if (platform, channel) not in TARGETS:
        return None
    try:
        data = json.loads(raw or '{}')
        release = data[platform][channel]
        version, build, url = release['version'], release['build'], release['url']
        notes = release.get('notes', '')
        if not all(isinstance(v, str) for v in (version, build, url, notes)):
            return None
        if not VERSION.fullmatch(version) or not NUMBER.fullmatch(build) or not TARGETS[platform, channel].fullmatch(url):
            return None
        if len(notes) > 1000:
            return None
        return dict(version=version, build=build, url=url, notes=notes, platform=platform, channel=channel)
    except (KeyError, ValueError, TypeError):
        return None
