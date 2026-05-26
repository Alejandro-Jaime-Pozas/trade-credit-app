# # TODO implement later on with view, update urls as well
# from rest_framework_simplejwt.serializers import TokenObtainPairSerializer


# class CustomTokenSerializer(TokenObtainPairSerializer):
#     @classmethod
#     def get_token(cls, user):
#         token = super().get_token(user)

#         # Add custom claims
#         token["email"] = user.email
#         token["username"] = user.username

#         return token
