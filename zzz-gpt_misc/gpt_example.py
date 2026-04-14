from openai import OpenAI
client = OpenAI()

# response = client.responses.retrieve("resp_077d36dc77f726d0006930d1b21860819580f4600a2cb5b3f2")
# print(response)


# from openai import OpenAI
# client = OpenAI()

# file = client.files.create(
#     file=open("dragonbook.pdf", "rb"),
#     purpose="user_data",
#     # expires_after={
#     #     'anchor': 'created_at',
#     #     # 'seconds': 1,
#     # }  # uncomment to enable file deletion from gpt storage
# )

# response = client.responses.create(
#     model="gpt-5",
#     input=[
#         {
#             "role": "user",
#             "content": [
#                 {
#                     "type": "input_file",
#                     "file_id": file.id,
#                 },
#                 {
#                     "type": "input_text",
#                     "text": "What is the first dragon in the book?",
#                 },
#             ]
#         }
#     ]
# )

# print(response.output_text)


# from openai import OpenAI
# from pydantic import BaseModel

# client = OpenAI()

# class CalendarEvent(BaseModel):
#     name: str
#     date: str
#     participants: list[str]

# response = client.responses.parse(
#     model="gpt-5-nano",
#     input=[
#         {
#             "role": "system",
#             "content": "Extract the event information."
#         },
#         {
#             "role": "user",
#             "content": "Alice, Emma and Bob are going to comicon on Friday.",
#         },
#     ],
#     text_format=CalendarEvent,
# )

# event = response.output_parsed

# # --- NEW PRINTING ---
# print("RAW MODEL RESPONSE:")
# print(response)

# print("\nPARSED OBJECT:")
# print(event)

# print("\nPARSED FIELDS:")
# print("Name:", event.name)
# print("Date:", event.date)
# print("Participants:", event.participants)


### SAMPLE OUTPUT

# Alex@MacBook-Air Sol_Bank % python openai_example.py
# RAW MODEL RESPONSE:
# ParsedResponse[CalendarEvent](id='resp_077d36dc77f726d0006930d1b21860819580f4600a2cb5b3f2', created_at=1764807090.0, error=None, incomplete_details=None, instructions=None, metadata={}, model='gpt-5-nano-2025-08-07', object='response', output=[ResponseReasoningItem(id='rs_077d36dc77f726d0006930d1b2865081959d14d02129c61fd3', summary=[], type='reasoning', content=None, encrypted_content=None, status=None), ParsedResponseOutputMessage[CalendarEvent](id='msg_077d36dc77f726d0006930d1bb5748819591e7c4d5711133d2', content=[ParsedResponseOutputText[CalendarEvent](annotations=[], text='{"name":"Comicon","date":"Friday","participants":["Alice","Emma","Bob"]}', type='output_text', logprobs=[], parsed=CalendarEvent(name='Comicon', date='Friday', participants=['Alice', 'Emma', 'Bob']))], role='assistant', status='completed', type='message')], parallel_tool_calls=True, temperature=1.0, tool_choice='auto', tools=[], top_p=1.0, background=False, conversation=None, max_output_tokens=None, max_tool_calls=None, previous_response_id=None, prompt=None, prompt_cache_key=None, prompt_cache_retention=None, reasoning=Reasoning(effort='medium', generate_summary=None, summary=None), safety_identifier=None, service_tier='default', status='completed', text=ResponseTextConfig(format=ResponseFormatTextJSONSchemaConfig(name='CalendarEvent', schema_={'properties': {'name': {'title': 'Name', 'type': 'string'}, 'date': {'title': 'Date', 'type': 'string'}, 'participants': {'items': {'type': 'string'}, 'title': 'Participants', 'type': 'array'}}, 'required': ['name', 'date', 'participants'], 'title': 'CalendarEvent', 'type': 'object', 'additionalProperties': False}, type='json_schema', description=None, strict=True), verbosity='medium'), top_logprobs=0, truncation='disabled', usage=ResponseUsage(input_tokens=88, input_tokens_details=InputTokensDetails(cached_tokens=0), output_tokens=797, output_tokens_details=OutputTokensDetails(reasoning_tokens=768), total_tokens=885), user=None, billing={'payer': 'developer'}, store=True)

# PARSED OBJECT:
# name='Comicon' date='Friday' participants=['Alice', 'Emma', 'Bob']

# PARSED FIELDS:
# Name: Comicon
# Date: Friday
# Participants: ['Alice', 'Emma', 'Bob']
