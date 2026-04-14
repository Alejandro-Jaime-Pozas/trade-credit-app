
def pass_into_serializer_check(serializer, obj, res):
    """
    Pass in a serializer, check if hyperlink serializer
    and account for request context if so.
    """
    return serializer(obj, context={'request': res.wsgi_request})  # may need to add logic for non-hyperlink serializer requests?
