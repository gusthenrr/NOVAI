# Data da descrição do anúncio

`POST /api/ext/items/created-at` consulta apenas o recurso oficial `/items/{item_id}/description`. Não recebe URLs nem HTML.

Corpo para um anúncio:

```json
{
  "item_id": "MLB6203834422",
  "access_token": "TOKEN_DO_MERCADO_LIVRE"
}
```

Também aceita `ids` (lista de até 10 anúncios MLB) no lugar de `item_id`. O token pode ser enviado no cabeçalho `Authorization: Bearer ...` em vez do corpo. Ele é usado somente na chamada à API oficial e não é salvo.

Resposta:

```json
{
  "items": [
    {
      "id": "MLB6203834422",
      "date": "2026-01-27",
      "createdAt": "2026-01-27T23:33:16.887Z",
      "source": "ml_description"
    }
  ]
}
```

`createdAt` preserva o timestamp original; `date` corresponde à parte da data desse timestamp. A extensão deve usar `createdAt` para formatar no fuso local.

Quando não existe descrição ou uma data válida, `date`, `createdAt` e `source` são `null`. `last_updated` nunca substitui `date_created`. A criação da descrição pode ser posterior à criação do anúncio.

Entradas inválidas retornam 400; token ausente retorna 401. Erros 401, 403 e 429 da API são preservados com um código de erro seguro. Falhas de rede/respostas inválidas retornam 502; timeout retorna 504. Todas as respostas usam `Cache-Control: no-store`.

Teste: `python -m unittest discover -s flask-backend/tests -v` com as dependências Flask e requests instaladas.
