"""
This will be used to clean up files created, etc to avoid rising costs.
Maybe later can use openai storage to our advantage...
"""
from openai import OpenAI
client = OpenAI()

files = client.files.list()

file_ids = [f.id for f in files.data]

print('Will delete the following files:', file_ids)

for f_id in file_ids:
    delete_status = client.files.delete(f_id)
    print(delete_status)


print('Remaining file ids:', client.files.list().data)
