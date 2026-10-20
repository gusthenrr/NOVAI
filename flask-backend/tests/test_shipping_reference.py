import os
import sys
from datetime import date
from decimal import Decimal
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from pricing_margin import validate
from shipping_reference import estimate_shipping
import test_pricing_margin as pricing_tests

TODAY = date(2026, 10, 20)


def reference(data):
    return estimate_shipping(data, today=TODAY)


class ReferenceRules(unittest.TestCase):
    def setUp(self):
        self.data = validate({'precoVenda': 100, 'custoProduto': 40, 'aliquotaImpostoPct': 4,
            'tipoAnuncio': 'classico', 'freteGratis': True, 'envioFull': True, 'envioFlex': False,
            'pesoGramas': 300, 'alturaCm': 5, 'larguraCm': 15, 'comprimentoCm': 20,
            'reputacao': 'verde', 'categoryId': 'MLB9600'})

    def test_verified_rows_and_price_boundaries(self):
        for price, cost in [('18.99', '5.65'), ('19', '6.85'), ('49', '8.15'),
                            ('79', '12.95'), ('100', '14.95'), ('120', '16.95'),
                            ('150', '19.05'), ('200', '21.65')]:
            self.assertEqual(reference({**self.data, 'precoVenda': Decimal(price)})[0], Decimal(cost))
        self.assertEqual(reference({**self.data, 'precoVenda': Decimal('10')})[0], Decimal('5'))
        self.assertEqual(reference({**self.data, 'precoVenda': Decimal('99.999')})[0], Decimal('14.95'))

    def test_physical_vs_volumetric_and_upward_rounding(self):
        self.assertEqual(reference(self.data)[1], 300)
        # 30 × 20 × 20 / 6000 = 2 kg, despite a physical mass of 300 g.
        changed = {**self.data, 'alturaCm': Decimal('30'), 'larguraCm': Decimal('20'), 'comprimentoCm': Decimal('20')}
        self.assertEqual(reference(changed)[:2], (Decimal('17.65'), 2000))
        self.assertEqual(reference({**self.data, 'pesoGramas': Decimal('300.01')})[0], Decimal('16.15'))

    def test_reputation_and_fast_shipping_are_not_arbitrary_percentages(self):
        self.assertEqual(reference({**self.data, 'reputacao': 'amarela'})[0], Decimal('17.94'))
        self.assertEqual(reference({**self.data, 'reputacao': 'vermelha'})[0], Decimal('29.90'))
        standard = {**self.data, 'precoVenda': Decimal('20'), 'pesoGramas': Decimal('2500')}
        self.assertEqual(reference(standard)[0], Decimal('8.65'))
        self.assertEqual(reference({**standard, 'freteGratisRapido': True})[0], Decimal('16.45'))

    def test_uncovered_modes_and_stale_tables_require_manual_cost(self):
        for mode in ('self_service', 'not_specified', 'drop_off'):
            self.assertIsNone(reference({**self.data, 'logistic_type': mode}))
        self.assertIsNone(estimate_shipping(self.data, today=date(2026, 11, 20)))
        self.assertIsNone(estimate_shipping(self.data, today=date(2026, 8, 23)))
        self.assertIsNone(reference({**self.data, 'alturaCm': Decimal(1000), 'larguraCm': Decimal(1000), 'comprimentoCm': Decimal(1000)}))


class ReferenceIntegration(unittest.TestCase):
    setUp = pricing_tests.PricingTests.setUp
    response = pricing_tests.PricingTests.response
    replies = pricing_tests.PricingTests.replies
    post = pricing_tests.PricingTests.post
    @patch('pricing_margin.estimate_shipping', side_effect=reference)
    @patch('pricing_margin.requests.get')
    def test_no_me2_opt_in_returns_estimated_profit_and_explicit_warnings(self, get, estimate):
        replies = self.replies()
        replies[1] = self.response({'message': 'user 123456 does Not have me2 enabled'}, 400)
        get.side_effect = replies
        response = self.post({**self.payload, 'permitirFreteEstimado': True})
        self.assertEqual(response.status_code, 200)
        result = response.json
        self.assertEqual(result['frete'], 14.95)
        self.assertEqual(result['margemContribuicao'], 26.05)
        self.assertEqual(result['missing'], [])
        self.assertEqual(result['freteOrigem'], 'tabela_referencia')
        self.assertIn('frete_estimado_sem_me2', result['avisos'])
        self.assertEqual(result['freteTabelaVersao'], '2026-08-24')
        self.assertEqual(get.call_args_list[2].kwargs['params']['billable_weight'], 300)

    @patch('pricing_margin.estimate_shipping', side_effect=reference)
    @patch('pricing_margin.requests.get')
    def test_both_listing_types_preserve_estimate_source_and_independent_fees(self, get, estimate):
        def reply(url, params=None, **kwargs):
            if url.endswith('/users/me'):
                return self.response({'id': 123456, 'site_id': 'MLB'})
            if url.endswith('/shipping_options/free'):
                return self.response({'message': 'user 123456 does Not have me2 enabled'}, 400)
            listing = params['listing_type_id']
            return self.response({'listing_type_id': listing, 'currency_id': 'BRL',
                'sale_fee_amount': 15 if listing == 'gold_special' else 20})
        get.side_effect = reply
        response = self.post({**self.payload, 'permitirFreteEstimado': True,
                              'incluirTiposAnuncio': True, 'tipoAnuncio': 'premium'})
        self.assertEqual(response.status_code, 200)
        options = response.json['opcoesAnuncio']
        for result in options.values():
            self.assertEqual(result['frete'], 14.95)
            self.assertEqual(result['freteOrigem'], 'tabela_referencia')
            self.assertIn('frete_estimado_sem_me2', result['avisos'])
            self.assertEqual(result['missing'], [])
        self.assertEqual(options['classico']['margemContribuicao'], 26.05)
        self.assertEqual(options['premium']['margemContribuicao'], 21.05)
        self.assertEqual(response.json['margemContribuicao'], 21.05)
        self.assertEqual(get.call_count, 5)

    @patch('pricing_margin.requests.get')
    def test_other_failures_never_become_estimates(self, get):
        for status, body in [(403, {}), (429, {}), (400, {'message': 'invalid dimensions'})]:
            replies = self.replies(); replies[1] = self.response(body, status); get.side_effect = replies
            result = self.post({**self.payload, 'permitirFreteEstimado': True}).json
            self.assertIsNone(result['frete'])
            self.assertIsNone(result['margemContribuicao'])
            self.assertNotIn('freteOrigem', result)

    @patch('pricing_margin.requests.get')
    def test_explicit_manual_cost_is_identified_and_never_queries_shipping(self, get):
        for cost, margin in [(0, 41), (12.5, 28.5)]:
            replies = self.replies(); get.side_effect = [replies[0], replies[2]]; get.reset_mock()
            result = self.post({**self.payload, 'permitirFreteEstimado': True, 'freteInformado': cost}).json
            self.assertEqual(result['frete'], cost)
            self.assertEqual(result['margemContribuicao'], margin)
            self.assertEqual(result['freteOrigem'], 'informado')
            self.assertEqual(result['avisos'], ['frete_informado'])
            self.assertEqual(get.call_count, 2)

    @patch('pricing_margin.requests.get')
    def test_invalid_fallback_inputs_do_not_reach_ml(self, get):
        for changed in [{'permitirFreteEstimado': 'true'}, {'freteInformado': 0},
                        {'permitirFreteEstimado': True, 'freteInformado': True},
                        {'permitirFreteEstimado': True, 'freteInformado': -1},
                        {'freteGratisRapido': 1}]:
            self.assertEqual(self.post({**self.payload, **changed}).status_code, 400)
        get.assert_not_called()
