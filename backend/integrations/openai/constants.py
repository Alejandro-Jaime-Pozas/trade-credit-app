"""
constants.py file for each different integration, since they
could have similar fields like max output tokens.
"""

# The OpenAI model every classification and extraction call runs on.
#
# gpt-5-nano is the cheapest model in the GPT-5 family, and that is the ONLY reason it is
# the one in use. It is measurably less capable than gpt-5: it misreads a document's type
# more often (a constancia mistaken for an acta, a scan it gives up on and labels
# `unknown`) and it misses or garbles individual extracted fields more often — dates,
# names, and amounts on dense or low-quality scans especially.
#
# That is an accepted tradeoff, not a bug to hunt: the app is built so a wrong answer is
# correctable rather than final (see docs/architecture/decisions.md § "The classifier runs
# on GPT-5 Nano"). If classification accuracy becomes the complaint users actually have,
# switching this one string to 'gpt-5' is the first thing to try — no other code changes.
GPT_MODEL_VERSION='gpt-5-nano'  # most cost-effective, not best reasoning # 'gpt-5'
MAX_OUTPUT_TOKENS=20_000
