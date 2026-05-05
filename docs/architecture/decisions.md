
## Decisions

- database atomicity:
  - currently making all db transactions atomic in settings.py with "ATOMIC_REQUESTS": True,
  - this hurts performance, will later need to switch..
  - INCLUDE @transaction.atomic MOVING FORWARD IF MULTI-STEP DB WRITE PROCESS, TO PREP LATER WHEN REMOVING GLOBAL SETTING
