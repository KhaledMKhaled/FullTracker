CREATE TABLE IF NOT EXISTS audit_logs (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id varchar(255) REFERENCES users(id),
  entity_type varchar(50) NOT NULL,
  entity_id varchar(255) NOT NULL,
  action_type varchar(50) NOT NULL,
  timestamp timestamp NOT NULL DEFAULT now(),
  details jsonb
);
