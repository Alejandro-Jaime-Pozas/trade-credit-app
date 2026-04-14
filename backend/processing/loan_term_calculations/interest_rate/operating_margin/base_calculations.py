# For a typical Mexican digital lender (unsecured SME or consumer focus):

# Operating margin component: ~4% to 8% annually
# (400–800 basis points)

# That is the most common sustainable range once the lender is at scale.

# Early-stage lenders may price 8%–12% to compensate for inefficiency and funding constraints, but that compresses with scale.


# TODO 1. Add operating margin. This covers origination, servicing, capital costs, and profit.
def get_operating_margin_rate():
    """
    Get the total operating margin rate.

    The operating margin must cover:
        Origination costs (sales, underwriting tech, commissions)
        Servicing and collections
        Administrative overhead
        Cost of capital buffer (equity return expectation)
        Profit margin

    It excludes:
        Risk premium (expected credit losses)
        Term add-ons
        Unsecured add-ons
        Concentration add-ons
        The base rate
    """

    # TODO change for calculated rate

    return 0.06
