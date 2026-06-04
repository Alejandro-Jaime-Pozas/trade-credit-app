from rest_framework import status
from rest_framework.response import Response
from rest_framework.viewsets import (
    ModelViewSet,
    ReadOnlyModelViewSet,
)

from app.mixins import OrganizationScopedMixin
from core.str_utils import pretty_print

from .serializers import (
    DocumentDataExtractSerializer,
    LabelSerializer,
    UploadDocumentSerializer,
)
from .models import (
    DocumentDataExtract,
    Label,
    UploadDocument,
)
from .services.db_object_handling import handle_upload_document_created


class UploadDocumentViewSet(
    OrganizationScopedMixin,
    ModelViewSet,
):

    queryset = UploadDocument.objects.all()
    serializer_class = UploadDocumentSerializer
    organization_lookup = 'customer__organization'  # TODO this is missing credit_case lookups if no customer linked to doc and only credit_case...fix

    # This create override is required to replace single obj req/res with list of objs
    def create(self, request, *args, **kwargs):
        """
        Trigger gpt process if this was the last UploadDocument required
        in account application process.
        """
        serializer = self.serializer_class(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        docs = serializer.save()  # list[UploadDocument]

        # # Run your side effects TODO later fix handling for new models, this is just temp for now
        # for doc in docs:
        #     # # Run gpt analysis of loan acct app if all required docs uploaded
        #     # # If approved, create a loan agmt doc for user to sign
        #     # result = handle_upload_document_created(doc)  # TEMP TODO later fix handling for new models
        #     # pretty_print(result)  # TEMP, this wont work for atomic txs

        # Return list response
        out = self.get_serializer(docs, many=True)
        return Response(out.data, status=status.HTTP_201_CREATED)


class DocumentDataExtractViewSet(
    OrganizationScopedMixin,
    ReadOnlyModelViewSet,
):

    queryset = DocumentDataExtract.objects.all()
    serializer_class = DocumentDataExtractSerializer
    organization_lookup = 'upload_document__customer__organization'  # TODO this is missing credit_case lookups if no customer linked to doc and only credit_case...fix


class LabelViewSet(
    OrganizationScopedMixin,
    ModelViewSet,
):

    queryset = Label.objects.all()
    serializer_class = LabelSerializer
    organization_lookup = 'customers__organization'  # TODO this is missing credit_case lookups if no customer linked to doc and only credit_case...fix
