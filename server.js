'use strict';

const express = require('express');
const superagent = require('superagent');
const cors = require('cors');
const app = express();
const pg = require('pg');

app.use(cors());
require('dotenv').config();
const PORT = process.env.PORT || 3000;

const client = new pg.Client(process.env.DATABASE_URL);
client.connect();

app.use(express.static('./'));

app.get('/', (request, response) => {
  response.status(200).send('Connected!');
});

app.get('/location', queryLocation);

app.get('/weather', weatherApp);

app.get('/events', eventsApp);

//uses google API to fetch coordinate data to send to front end using superagent
//has a catch method to handle bad user search inputs in case google maps cannot
//find location
function locationApp(request, response) {
  const googleMapsUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${request.query.data}&key=${process.env.GEOCODE_API_KEY}`;
  return superagent.get(googleMapsUrl)
    .then(result => {
      const location = new Location(request, result);
      let insertSQL = 'INSERT INTO locations ( search_query, formatted_query, latitude, longitude ) VALUES ( $1, $2, $3, $4 );';
      let insertParams = [location.search_query, location.formatted_query, location.latitude, location.longitude];
      client.query(insertSQL, insertParams);
      // return location;
      response.send(location);
    })
    .catch(error => handleError(error, response));
}

//find in location table function
function queryLocation(request, response) {
  let sql = 'SELECT * FROM locations WHERE search_query = $1;';
  let params = [request.query.data];
  return client.query(sql, params)
    .then(result => {
      if (result.rowCount > 0) {
        response.send(result.rows[0]);
      } else {
        locationApp(request, response);
      }
    })
    .catch(error => handleError(error, response));
}

function queryTable(table, request, response) {
  let sql = `SELECT * FROM ${table} WHERE location = $1`;
  let values = [request.query.data.search_query];
  return client.query(sql, values)
    .then(result => {
      console.log(result);
      if (result.rowCount > 0) {
        console.log(result.rowCount);
        response.send(result.rows);
      } else {
        if (table === 'weathers') {
          getWeatherAPI(request, response);
        } else if (table === 'events') {
          getEventsAPI(request, response);
        }
      }
    })
    .catch(error => handleError(error, response));
}

function weatherApp(req, res) {
  queryTable('weathers', req, res);
}

function getWeatherAPI(req, res) {
  const darkSkyUrl = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${req.query.data.latitude},${req.query.data.longitude}`;
  return superagent.get(darkSkyUrl)
    .then(result => {
      //make map one liner
      const weatherSummaries = result.body.daily.data.map(data => {
        const day = new Weather(data, req.query.data.search_query);
        const SQL = `INSERT INTO weathers (forecast, time, location) VALUES ($1, $2, $3);`;
        const values = [data.summary, day.time, day.location];
        client.query(SQL, values);
        return day;
      });
      res.send(weatherSummaries);
    })
    .catch(error => handleError(error, res));
}

function eventsApp(req, res) {
  queryTable('events', req, res);
}

function getEventsAPI(req, res) {
  const eventBriteUrl = `https://www.eventbriteapi.com/v3/events/search/?location.within=10mi&location.latitude=${req.query.data.latitude}&location.longitude=${req.query.data.longitude}&token=${process.env.EVENTBRITE_API_KEY}`;
  return superagent.get(eventBriteUrl)
    .then(result => {
      const eventSummaries = result.body.events.map(event => {
        const eventItem = new Event(event, req.query.data.search_query);
        const SQL = `INSERT INTO events (link, name, event_date, summary, location) VALUES ($1, $2, $3, $4, $5);`;
        const values = [event.url, event.name.text, event.start.local, event.description.text, eventItem.location];
        client.query(SQL, values);
        return eventItem;
      });
      res.send(eventSummaries);
    })
    .catch(error => handleError(error, res));
}

function handleError(err, res) {
  if (res) res.status(500).send('Internal 500 error!');
}

function Weather(day, location) {
  this.location = location;
  this.time = new Date(day.time * 1000).toDateString();
  this.forecast = day.summary;
  this.created_at = Date.now();
}

function Location(request, result) {
  this.search_query = request.query.data;
  this.formatted_query = result.body.results[0].formatted_address;
  this.latitude = result.body.results[0].geometry.location.lat;
  this.longitude = result.body.results[0].geometry.location.lng;
}

function Event(data, location) {
  this.location = location;
  this.link = data.url;
  this.name = data.name.text;
  this.event_date = new Date(data.start.local).toDateString();
  this.summary = data.description.text;
  this.created_at = Date.now();
}

function Movie(movie){
  this.title = movie.title;
  this.overview = movie.overview;
  this.average_votes = movie.vote_average;
  this.total_votes = movie.vote_count;
  this.image_url = movie;/// not done
  this.popularity = movie.popularity;
  this.released_on = movie.release_date;
}

function Yelp(yelp){
  this.name = yelp.name;
  this.image_url = yelp.image_url;
  this.price = yelp.price;
  this.rating = yelp.rating;
  this.url = yelp.url;
}

app.listen(PORT, () => console.log(`Listening on ${PORT}`));
