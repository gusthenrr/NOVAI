"""Server-owned NOVAI entitlements; client redirects never grant access."""
from precify_core import now

NOVAI_BILLING_TERMS_VERSION='2026-11-03-novai-subscriptions'


def novai_plan_for(cur,user_id):
    cur.execute('INSERT INTO novai_accounts(user_id) VALUES(%s) ON CONFLICT DO NOTHING',(user_id,))
    cur.execute('SELECT trial_started_at,trial_ends_at,trial_plan_code FROM novai_accounts WHERE user_id=%s',(user_id,))
    trial=cur.fetchone()
    cur.execute("""SELECT s.novai_plan_code AS tier,p.period_end FROM precify_subscriptions s
      JOIN precify_payments p ON p.subscription_id=s.id
      WHERE s.user_id=%s AND s.product_code='novai' AND p.status='approved' AND p.period_end>NOW()
      ORDER BY CASE s.novai_plan_code WHEN 'max' THEN 2 ELSE 1 END DESC,p.period_end DESC LIMIT 1""",(user_id,))
    paid=cur.fetchone()
    testing=bool(trial['trial_ends_at'] and trial['trial_ends_at']>now())
    tier=paid['tier'] if paid else trial['trial_plan_code'] if testing else 'free'
    end=paid['period_end'] if paid else trial['trial_ends_at'] if testing else None
    return dict(tier=tier,status='active' if paid else 'trialing' if testing else 'free',
                validUntil=end.isoformat() if end else None,trialAvailable=not trial['trial_started_at'] and not paid,
                features=dict(extension=tier in ('pro','max'),dashboard=tier=='max',precifyPro=tier=='max'))
