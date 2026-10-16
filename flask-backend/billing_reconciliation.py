"""Recover billing state after missed webhooks without requiring an app visit."""
from flask import current_app
from precify_core import ApiError,db
from precify_billing import configured,reconcile_subscription


def run_once():
    if not configured(): return
    # A short claim transaction, then network calls outside its lock.
    with db() as cur:
        cur.execute("""WITH due AS (
          SELECT s.id FROM precify_subscriptions s WHERE s.reconcile_after<=NOW()
          AND (s.status IN ('pending','authorized','paused') OR EXISTS (
            SELECT 1 FROM precify_payments p WHERE p.subscription_id=s.id AND p.period_end>NOW()))
          ORDER BY s.reconcile_after FOR UPDATE SKIP LOCKED LIMIT 1)
          UPDATE precify_subscriptions s SET reconcile_after=NOW()+INTERVAL '30 minutes'
          FROM due WHERE s.id=due.id RETURNING s.*""")
        sub=cur.fetchone()
    if not sub: return
    error=None
    try: reconcile_subscription(sub)
    except ApiError as exc: error=exc.code
    except Exception: error='reconciliation_unavailable'
    with db() as cur:
        cur.execute("""UPDATE precify_subscriptions SET reconcile_error=%s,
          reconciled_at=CASE WHEN %s IS NULL THEN NOW() ELSE reconciled_at END,
          reconcile_after=NOW()+INTERVAL '15 minutes' WHERE id=%s""",(error,error,str(sub['id'])))
    if error: current_app.logger.warning('Billing reconciliation pending: %s',error)


def start(app):
    if app.testing or not configured(): return
    from apscheduler.schedulers.background import BackgroundScheduler
    scheduler=BackgroundScheduler(daemon=True)
    def tick():
        with app.app_context():
            try: run_once()
            except Exception: app.logger.warning('Billing reconciliation worker unavailable')
    scheduler.add_job(tick,'interval',seconds=60,max_instances=1,coalesce=True)
    scheduler.start()
    app.extensions['billing_reconciler']=scheduler
