import requests
import datetime
import os
item='MLB4133141233'
token = 'APP_USR-3414621845496970-093017-134924dbee4d90e9d7c66c70e8a8b027-472633863'
def teste():
    print("Buscando visualizações...")
    #url = "https://api.mercadolibre.com/visits/items?ids=MLB5750367770"
    product_id='MLB52362835'
    url= f'https://api.mercadolibre.com/products/{product_id}'
    response = requests.get(url, headers={"Authorization": f"Bearer {token}"})
    print("Status:", response.status_code)
    print(response.json())

#@app.route('/visitas_por_mes', methods=['POST'])
def visitas_por_mes():
    #with get_db_connection() as conn, conn.cursor() as cur:
        #cur.execute('SELECT acess_token FROM tokens LIMIT 1')
        #acess_token_dict = cur.fetchone()
        #token = acess_token_dict['acess_token']
    #data = request.get_json()
    #conversion = data.get('conversion')
    #item = data.get('item_id')
    #price = data.get('price', 0)
    print("Buscando visualizações...")
    total_visits_mes=0
    date_to= datetime.datetime.now().strftime('%Y-%m-%d')
    meses = []
    faturamentos = []
    for i in range(0,24):
        date_from= (datetime.datetime.now() - datetime.timedelta(days=(i+1)*30)).strftime('%Y-%m-%d')
        date_to= (datetime.datetime.now() - datetime.timedelta(days=i*30)).strftime('%Y-%m-%d')
        url_por_mes= f'https://api.mercadolibre.com/items/visits?ids={item}&date_from={date_from}&date_to={date_to}'
        response = requests.get(url_por_mes, headers={"Authorization": f"Bearer {token}"})
        visitas=response.json()
        date_from= (datetime.datetime.now() - datetime.timedelta(days=(i+1)*30)).strftime('%Y-%m-%d')
        print(f'Mês: {date_from}', end=' ')
        total_visits_mes=int(visitas[0]['total_visits'])
        meses.append(total_visits_mes)
        #faturamentos.append(int(total_visits_mes * (conversion/100))*price)
        print(f'{i+1}: ',total_visits_mes)
    print("Status:", response.status_code)
    return {'meses': meses, 'faturamentos': faturamentos}

if __name__ == "__main__":
    teste()
