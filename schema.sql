DROP TABLE IF EXISTS weathers;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS locations;

CREATE TABLE IF NOT EXISTS locations ( 
  id SERIAL PRIMARY KEY, 
  search_query VARCHAR(255), 
  formatted_query VARCHAR(255), 
  latitude NUMERIC(8, 6), 
  longitude NUMERIC(9, 6),
  created_at BIGINT
);

CREATE TABLE IF NOT EXISTS weathers ( 
  id SERIAL PRIMARY KEY, 
  forecast VARCHAR(255), 
  time VARCHAR(255), 
  created_at BIGINT,
  location_id INTEGER,
  location VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  link VARCHAR(255),
  event_date VARCHAR(255),
  summary TEXT,
  created_at BIGINT,
  location_id INTEGER,
  location VARCHAR(255)
);