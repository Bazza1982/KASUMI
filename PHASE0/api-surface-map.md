# Baserow API Surface Map

## Base URL
http://localhost:8000/api

## Authentication
Header: Authorization: Token <user_token>

## Endpoints Required

### Table Metadata
GET /database/tables/{table_id}/
Response: { id, name, database_id, order }

### Fields
GET /database/fields/?table_id={id}
Response: { count, results: [ { id, name, type, order, primary, read_only, ...type_options } ] }

### Views
GET /database/views/?table_id={id}
Response: { count, results: [ { id, name, type, order, filter_type, filters_disabled } ] }

### Rows (paginated)
GET /database/rows/table/{table_id}/?view_id={id}&page=1&size=200&include=field_1,field_2
Response: { count, next, previous, results: [ { id, order, field_{id}: value, ... } ] }

### Row Update (single)
PATCH /database/rows/table/{table_id}/{row_id}/
Body: { field_{id}: value }
Response: updated row object

### Row Batch Update
PATCH /database/rows/table/{table_id}/batch/
Body: { items: [ { id: row_id, field_{id}: value } ] }
Response: { items: [ updated row objects ] }

### Row Create
POST /database/rows/table/{table_id}/
Body: { field_{id}: value }

### Row Delete
DELETE /database/rows/table/{table_id}/{row_id}/

### Batch Row Delete
POST /database/rows/table/{table_id}/batch-delete/
Body: { items: [row_id, ...] }

## Field Types
text, long_text, number, boolean, date, single_select, multiple_select,
link_row, file, email, url, phone_number, formula, lookup, count, rollup,
created_on, last_modified, uuid, autonumber, duration, rating

## WebSocket
ws://localhost:8000/ws/core/?jwt_token={token}
Events: row_created, row_updated, row_deleted, field_created, field_updated, field_deleted
