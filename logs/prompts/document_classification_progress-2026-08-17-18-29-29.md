# Prompt — 2026-08-17 18:29:29

> so we made a change to backend now uses celery/redis to queue jobs. we need to implement
> for upload files, wherever that may be, the file type name which is pending
> classification while the gpt process runs in the background with celery:
>
> - if file is pending classification, and celery is actively running the gpt process, a
>   loading icon like the one for pending pending AI verdict in credit case field
> - use react to update without full page refresh the file type name once there is one.
