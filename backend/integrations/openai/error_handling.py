# Handle Debugging errors
import json
from typing import Any


def handle_response_status_incomplete(response):
    raise ValueError(
        f"Response is incomplete. Reason: {response.incomplete_details.reason if response.incomplete_details else 'unknown'}. "
        f"Output tokens used: {response.usage.output_tokens if response.usage else 'unknown'}. "
        f"Consider increasing max_output_tokens or reducing reasoning effort."
    )

def handle_response_has_no_attr_output_text(response):
    raise AttributeError(
        f"Response object does not have 'output_text' attribute. "
        f"Available attributes: {dir(response)}"
    )

def log_gpt_response(response, raw_json: str = None):
    print("DEBUG: Response status:", response.status)
    # print("DEBUG: response.output_text:")
    # print(repr(raw_json))

def check_if_output_in_response_output_list(response):
    # Check if output is in the output list
    if hasattr(response, 'output') and response.output:
        print("DEBUG: Checking output list for text content...")
        for item in response.output:
            print(f"DEBUG: Output item type: {getattr(item, 'type', 'unknown')}")
            if hasattr(item, 'content') and item.content:
                print(f"DEBUG: Found content in output item: {item.content[:200]}")

    raise ValueError(
        "Response output_text is empty or None. "
        f"Response status: {response.status}. "
        f"Output tokens: {response.usage.output_tokens if response.usage else 'unknown'}. "
        f"Consider increasing max_output_tokens."
    )

def handle_get_json_data(raw_json: Any):
    try:
        data = json.loads(raw_json)
        return data
    except json.JSONDecodeError as e:
        raise ValueError(
            f"Failed to parse JSON from response.output_text: {e}. "
            f"Raw content: {repr(raw_json)}"
        ) from e

