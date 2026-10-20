"""Offline reference scenario, never a seller-specific ML quote.

General new-product tables, verified on the public ML help pages. Excludes
Flex/custom/Correios and category-specific benefits; manual costs cover those
cases. review_by is our maintenance deadline, NOT an ML expiry date.
"""
from datetime import date, datetime
from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP
import json
from pathlib import Path
from zoneinfo import ZoneInfo

TABLE = json.loads((Path(__file__).parent / 'data' / 'shipping_reference.json').read_text())


def estimate_shipping(data, today=None):
    current_day = today or datetime.now(ZoneInfo('America/Sao_Paulo')).date()
    if not date.fromisoformat(TABLE['effective_from']) <= current_day <= date.fromisoformat(TABLE['review_by']):
        return None
    if data['logistic_type'] not in ('fulfillment', 'cross_docking', 'xd_drop_off'):
        return None
    group = {'verde': 'green', 'verde-claro': 'green', 'sem-reputacao': 'green',
             'amarela': 'yellow', 'laranja': 'red', 'vermelha': 'red'}[data['reputacao']]
    # Same upward rounding of dimensions/grams as the official-quote request.
    dimensions = [data[key].to_integral_value(rounding=ROUND_CEILING)
                  for key in ('alturaCm', 'larguraCm', 'comprimentoCm')]
    volumetric_grams = dimensions[0] * dimensions[1] * dimensions[2] / 6
    weight = max(data['pesoGramas'], volumetric_grams).to_integral_value(rounding=ROUND_CEILING)
    # A package outside the validated input mass range needs a manual estimate.
    if weight > 1000000:
        return None
    row = next(i for i, maximum in enumerate(TABLE['weight_max_grams']) if maximum is None or weight <= maximum)
    price = data['precoVenda'].quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    column = max(i for i, minimum in enumerate(TABLE['price_min_cents']) if price * 100 >= minimum)
    if price < 79 and data.get('freteGratisRapido'):
        column = 3
    cost = Decimal(TABLE['rates_cents'][group][row][column]) / 100
    if price < 19:
        cost = min(cost, price / 2)
    return cost, int(weight), TABLE['effective_from']
