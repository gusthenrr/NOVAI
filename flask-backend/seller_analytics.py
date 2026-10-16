"""Bounded, parameterized account snapshots. Model output is never SQL."""
from psycopg2 import sql
from precify_core import ApiError

# Each relation has a fixed tenant column. Credentials, accounts and billing are
# deliberately absent. Identifiers come only from this server-owned map.
TABLES={
 'itens':('usuario_id_item',('item_id','nome_item','quantidade','preco'),'item_id'),
 'pedidos_resumo':('usuario_id_pedidos_resumo',('item_id','nome_item','quantity','unit_price','total_amount','status','date_created'),'date_created'),
 'anuncios':('usuario_id_anuncios',('item_id','title','price','status','campanha_id'),'item_id'),
 'campanhas':('usuario_id_campanhas',('campanha_id','nome','status','budget'),'campanha_id'),
 'anuncios_metricas_diarias':('usuario_id_anuncios_metricas_diarias',('item_id','title','clicks','prints','cost','direct_amount','indirect_amount','organic_amount','date'),'date'),
 'campanhas_metricas_diarias':('usuario_id_campanhas_metricas_diarias',('campanha_id','nome','clicks','prints','cost','direct_amount','indirect_amount','organic_amount','date'),'date'),
 'reputacao_vendedor':('usuario_id_reputacao_vendedor',('level_id','power_seller_status','total_transactions','completed_transactions','canceled_transactions'),'level_id'),
 'dados_vendedor':('usuario_id_dados_vendedor',('nickname','site_id','registration_date'),'nickname'),
 'packs':('usuario_id_packs',('pack_id',),'pack_id'),
 'messages':('usuario_id_messages',('item_id','pack_id','message','author','date_created'),'date_created'),
 'reclamacoes':('usuario_id_reclamacoes',('id','status','reason_id','date_created'),'date_created'),
}


def account_snapshots(connect,tables,user_id):
    if not isinstance(tables,list) or len(tables)>6 or any(t not in TABLES for t in tables):
        raise ApiError('unsupported_analytics_table')
    output=[]
    conn=connect()
    try:
        # Defense in depth; no SQL supplied by the user/model is evaluated.
        conn.set_session(readonly=True,autocommit=False)
        with conn,conn.cursor() as cur:
            cur.execute("SET LOCAL statement_timeout='3000ms'")
            for table in dict.fromkeys(tables):
                owner,columns,order=TABLES[table]
                cur.execute('SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=%s',(table,))
                available={r['column_name'] for r in cur.fetchall()}
                selected=[c for c in columns if c in available]
                if owner not in available or not selected:
                    output.append({'table':table,'unavailable':True,'dados retornados da query':[]})
                    continue
                query=sql.SQL('SELECT {} FROM {} WHERE {}=%s').format(sql.SQL(',').join(map(sql.Identifier,selected)),sql.Identifier(table),sql.Identifier(owner))
                if order in ('date','date_created') and order in available:
                    query+=sql.SQL(" AND {}>=NOW()-INTERVAL '30 days'").format(sql.Identifier(order))
                if order in available: query+=sql.SQL(' ORDER BY {} DESC').format(sql.Identifier(order))
                query+=sql.SQL(' LIMIT 100')
                cur.execute(query,(int(user_id),))
                output.append({'table':table,'limit':100,'period':'30 days' if order in ('date','date_created') else None,'dados retornados da query':[dict(r) for r in cur.fetchall()]})
        return output
    finally: conn.close()
