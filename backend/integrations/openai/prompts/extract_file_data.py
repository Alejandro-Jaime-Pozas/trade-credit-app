EXTRACT_FILE_TYPE_NAME = f"""
    Determine the appropriate file_type_name by scanning the file contents.

    Rules:
    - Must choose one of the options in the enum property
    - If no other file_type_name matches the file contents, or if you're unsure if there's a clear match, set to 'unknown'.
"""


EXTRACT_FILE_DATA = f"""

    Populate the schema according to the file_type_name:

    Example: if the file_type_name is cashflow_statement, use your best
    judgment to fill out the schema fields for a cashflow statement.

    Rules:
    - Follow the JSON schema exactly. Do not include additional fields.
    - If you can infer a field with the available data, do it.
    - If a field is not found in the data, set it to null.
    - If file_type_name is unknown, provide a super concise one-sentence for reason field.
    - A cashflow_statement and income_statement must:
        - Not include bank specific data such as bank account number or bank name.
    - When extracting date fields, the year should always be between 2000 and the current year.
    - A constancia_de_situacion_fiscal's date_range_start and date_range_end should be the same, the exact date is below the 'Lugar y Fecha de Emisión' text or similar if available.
"""

def get_file_data_prompt(file_type_name: str):
    return f'file_type_name = {file_type_name}.' + EXTRACT_FILE_DATA



# # OLD VERSION
# EXTRACT_FILE_DATA = f"""
#     Use the EXTRACTED_FILE_DATA_SCHEMA to do the following.

#     1. Extract the file_type_name from the file's contents, which should exactly match the file_type_name field within each of the ExtractedFileData's Union list's pydantic model options, and fallback to the 'unknown' file_type_name if you're unable to clearly match the file with its correct file_type_name option.

#     2. Use the file_type_name to get the correct json schema, and return its required values based on the file's contents. If you cannot extract a value, leave as a falsy value depending on schema constraints.
# """
