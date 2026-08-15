import pytest
from django.urls import reverse
from processing.models import CreditCase
from storage.models import CreditCaseRequirement, UploadDocument
from storage.tests.views_serializers.test_requirements import (
    make_org, make_user_in_org, make_client_for, make_customer, make_credit_case, global_file_type,
)

@pytest.mark.django_db
def test_probe():
    org = make_org(); user = make_user_in_org(org); client = make_client_for(user)
    cc = make_credit_case(make_customer(org), status='pending_final_verdict')
    CreditCaseRequirement.objects.create(credit_case=cc, file_type=global_file_type('bank_statement'))
    UploadDocument.objects.create(credit_case=cc, file='x.pdf', file_type_name='bank_statement')
    res = client.post(
        reverse('creditcaserequirement-list'),
        data={'credit_case': reverse('creditcase-detail', args=[cc.id]),
              'file_type': global_file_type('income_statement').id},
    )
    print("STATUS:", res.status_code)
    print("BODY:", res.data)
    print("ROWS:", list(cc.requirements.values('file_type__key','source','is_excluded')))
