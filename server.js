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

app.get('/location', locationsApp);
app.get('/weather', weatherApp);
app.get('/events', eventsApp);
app.get('/movies', moviesApp);
app.get('/yelp', yelpApp);

//uses google API to fetch coordinate data to send to front end using superagent
//has a catch method to handle bad user search inputs in case google maps cannot
//find location

let myLocation;

function locationsApp(req,res){
  queryTable('locations', req, res);
}

function eventsApp(req, res) {
  queryTable('events', req, res);
}

function weatherApp(req, res) {
  queryTable('weathers', req, res);
}

function moviesApp(req,res){
  queryTable('movies', req, res);
}

function yelpApp(req,res){
  queryTable('yelps', req, res);
}

function queryTable(table, request, response) {
  let locColumn;
  table === 'locations' ? locColumn = 'search_query' : locColumn = 'location';
  console.log(`----- locColumn = ${locColumn} in table ${table}`);
  let sql = `SELECT * FROM ${table} WHERE ${locColumn} = $1 ;`;
  let param;
  table === 'locations' ? param = request.query.data : param = request.query.data.search_query;
  let values = [param];
  return client.query(sql, values)
    .then(result => {
      console.log(`${table.toUpperCase()} # ROWS ARE `, result.rowCount);
      if (result.rowCount > 0) {
        let qryResult = result.rows;
        let dateOnDB = qryResult[0].created_at;
        console.log('Difference in current time and database data: ',(Date.now() - dateOnDB)/1000, ' seconds');
        if(Date.now() - dateOnDB > cacheTimes[table]){
          refreshData(table,request,response);
        }else{
          if(table === 'locations'){
            response.send(result.rows[0]);
          }else{
            response.send(qryResult);
          }
        }
      } else {
        return callAPI(table, request, response);
      }
    })
    .catch(error => handleError(error, response));
}

function refreshData(table,request,response){
  let locColumn;
  table === 'locations' ? locColumn = 'search_query' : locColumn = 'location';
  let sql = `DELETE FROM ${table} WHERE ${locColumn} = $1 ;`;
  let param;
  table === 'locations' ? param = request.query.data : param = request.query.data.search_query;
  let values = [param];
  return client.query(sql,values)
    .then(result => {
      console.log(`-------REFRESHING DATA OF ${table} ------------`);
      console.log(`${table} `,result);
      return callAPI(table,request,response);
    })
    .catch(error => handleError(error, response));
}

function callAPI(table,request, response){
  switch(table){
  case 'locations':
    return getLocationAPI(request, response);
  case 'weathers':
    return getWeatherAPI(request, response);
  case 'events':
    return getEventsAPI(request, response);
  case 'movies':
    return getMoviesAPI(request,response);
  case 'yelps':
    return getYelpAPI(request,response);
  }

}

function getLocationAPI(request, response) {
  const googleMapsUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${request.query.data}&key=${process.env.GEOCODE_API_KEY}`;
  return superagent.get(googleMapsUrl)
    .then(result => {
      myLocation = new Location(request, result);
      let insertSQL = 'INSERT INTO locations ( search_query, formatted_query, latitude, longitude, created_at) VALUES ( $1, $2, $3, $4, $5);';
      let insertParams = [myLocation.search_query, myLocation.formatted_query, myLocation.latitude, myLocation.longitude, myLocation.created_at];
      client.query(insertSQL, insertParams);
      response.send(myLocation);
    })
    .catch(error => handleError(error, response));
}

function getWeatherAPI(req, res) {
  const darkSkyUrl = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${req.query.data.latitude},${req.query.data.longitude}`;
  return superagent.get(darkSkyUrl)
    .then(result => {
      //make map one liner
      const weatherSummaries = result.body.daily.data.map(data => {
        const day = new Weather(data, req.query.data.search_query);
        const SQL = `INSERT INTO weathers (forecast, time, location, created_at) VALUES ($1, $2, $3, $4);`;
        const values = [data.summary, day.time, day.location, day.created_at];
        client.query(SQL, values);
        return day;
      });
      res.send(weatherSummaries);
    })
    .catch(error => handleError(error, res));
}

function getEventsAPI(req, res) {
  const eventBriteUrl = `https://www.eventbriteapi.com/v3/events/search/?location.within=10mi&location.latitude=${req.query.data.latitude}&location.longitude=${req.query.data.longitude}&token=${process.env.EVENTBRITE_API_KEY}`;
  return superagent.get(eventBriteUrl)
    .then(result => {
      const eventSummaries = result.body.events.map(event => {
        const eventItem = new Event(event, req.query.data.search_query);
        const SQL = `INSERT INTO events (link, name, event_date, summary, location, created_at) VALUES ($1, $2, $3, $4, $5, $6);`;
        const values = [event.url, event.name.text, event.start.local, event.summary, eventItem.location, eventItem.created_at];
        client.query(SQL, values);
        return eventItem;
      });
      res.send(eventSummaries);
    })
    .catch(error => handleError(error, res));
}

function getMoviesAPI(req, res) {
  const moviesUrl = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.MOVIE_API_KEY}&query=${req.query.data.search_query}`;

  return superagent.get(moviesUrl)
    .then(result => {
      const movieList = result.body.results.map(movie => {
        const movieItem = new Movie(movie, req.query.data.search_query);

        const SQL = `INSERT INTO movies (title, overview, average_votes, total_votes, image_url, popularity, released_on, created_at, location) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`;
        const values = [movieItem.title, movieItem.overview, movieItem.average_votes, movieItem.total_votes, movieItem.image_url, movieItem.popularity, movieItem.released_on, movieItem.created_at, movieItem.location];

        client.query(SQL, values);
        return movieItem;
      });
      res.send(movieList);
    })
    .catch(error => handleError(error, res));
}

function getYelpAPI(req, res) {
  const yelpUrl = `https://api.yelp.com/v3/businesses/search?latitude=${req.query.data.latitude}&longitude=${req.query.data.longitude}`;

  return superagent.get(yelpUrl)
    .set('Authorization', `Bearer ${process.env.YELP_API_KEY}`)
    .then(result => {
      const yelpList = result.body.businesses.map(yelp => {
        const yelpItem = new Yelp(yelp,req.query.data.search_query);

        const SQL = `INSERT INTO yelps (name, image_url, price, rating, url, created_at, location) VALUES ($1, $2, $3, $4, $5, $6, $7);`;
        const values = [yelpItem.name, yelpItem.image_url, yelpItem.price, yelpItem.rating, yelpItem.url, yelpItem.created_at, yelpItem.location];

        client.query(SQL, values);
        // console.log(yelpItem.name);
        return yelpItem;
      });
      res.send(yelpList);
    })
    .catch(error => handleError(error, res));
}

function handleError(err, res) {
  res.send({ 'status': 500, 'responseText': `Sorry, something went wrong - Error was ${err}`});
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
  this.created_at = Date.now();
}

function Event(data, location) {
  this.location = location;
  this.link = data.url;
  this.name = data.name.text;
  this.event_date = new Date(data.start.local).toDateString();
  this.summary = data.summary;
  this.created_at = Date.now();
}

function Movie(movie, location){
  this.title = movie.title;
  this.overview = movie.overview;
  this.average_votes = movie.vote_average;
  this.total_votes = movie.vote_count;
  this.image_url = `http://image.tmdb.org/t/p/w185/${movie.poster_path}`;
  this.popularity = movie.popularity;
  this.released_on = movie.release_date;
  this.created_at = Date.now();
  this.location = location;
}

function Yelp(yelp, location){
  this.name = yelp.name;
  this.image_url = yelp.image_url;
  this.price = yelp.price;
  this.rating = yelp.rating;
  this.url = yelp.url;
  this.created_at = Date.now();
  this.location = location;
}

const cacheTimes = {
  weathers: 20 * 1000,
  locations: 60 * 1000,
  events: 40 * 1000,
  movies: 50 * 1000,
  yelp: 30 * 1000
};

app.listen(PORT, () => console.log(`Listening on ${PORT}`));
