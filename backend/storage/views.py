from django.db import transaction
from rest_framework import status
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from core.str_utils import pretty_print

from .serializers import (
    UploadDocumentSerializer,
)
from .models import (
    UploadDocument,
)
from .services.db_object_handling import handle_upload_document_created


class UploadDocumentViewSet(ModelViewSet):

    queryset = UploadDocument.objects.all()
    serializer_class = UploadDocumentSerializer

    # This create override is required to replace single obj req/res with list of objs
    def create(self, request, *args, **kwargs):
        """
        Trigger gpt process if this was the last UploadDocument required
        in account application process.
        """
        serializer = self.serializer_class(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        docs = serializer.save()  # list[UploadDocument]

        # Run your side effects
        for doc in docs:
            # Run gpt analysis of loan acct app if all required docs uploaded
            # If approved, create a loan agmt doc for user to sign
            result = handle_upload_document_created(doc)
            pretty_print(result)  # TEMP, this wont work for atomic txs

            # If result returns a BuroDeCreditoReport obj, means bdc report failed, so can safely terminate the account_application

        # Return list response
        out = self.get_serializer(docs, many=True)
        return Response(out.data, status=status.HTTP_201_CREATED)
