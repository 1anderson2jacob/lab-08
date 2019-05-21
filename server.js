'use strict';

// Application Dependencies
const express = require('express');
const superagent = require('superagent');
const pg = require('pg');
const cors = require('cors');


// Load environment variables from .env file
require('dotenv').config();

// Application Setup
const app = express();
const PORT = process.env.PORT;
app.use(cors());

//Database Setup
const client = new pg.Client(process.env.DATABASE_URL)
client.connect();
client.on('error', err => console.error(err));

app.get('/location', getLocation);
app.get('/weather', getWeather);
app.get('/movies', getMovies);
app.get('/yelp', getYelp);
app.get('/meetups', getMeetups);
app.get('/trails', getTrails);

// Make sure the server is listening for requests
app.listen(PORT, () => console.log(`Listening on ${PORT}`));

// ++++++++++++ MODELS ++++++++++++++++
//Location Model
function Location(query, res) {
  this.tableName = 'locations';
  this.search_query = query;
  this.formatted_query = res.body.results[0].formatted_address;
  this.latitude = res.body.results[0].geometry.location.lat;
  this.longitude = res.body.results[0].geometry.location.lng;
  this.created_at = Date.now();
}

Location.lookupLocation = (location) => {
  const SQL = `SELECT * FROM locations WHERE search_query=$1;`;
  const values = [location.query];

  return client.query(SQL, values)
    .then(result => {
      if (result.rowCount > 0) {
        console.log('We have a match for location');
        location.cacheHit(result);
      } else {
        console.log('We do not have a location match');
        location.cacheMiss();
      }
    })
    .catch(console.error);
}

Location.prototype = {
  save: function () {
    const SQL = `INSERT INTO locations (search_query, formatted_query, latitude, longitude) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id;`;
    const values = [this.search_query, this.formatted_query, this.latitude, this.longitude];

    return client.query(SQL, values)
      .then(result => {
        this.id = result.rows[0].id;
        return this;
      })
  }
}
//Weather Model
function Weather(day) {
  this.tableName = 'weathers';
  this.forecast = day.summary;
  this.time = new Date(day.time * 1000).toString().slice(0, 15);
  this.created_at = Date.now();
}

Weather.tableName = 'weathers';
Weather.lookup = lookup;
Weather.deleteByLocationId = deleteByLocationId;

Weather.prototype = {
  save: function (location_id) {
    const SQL = `INSERT INTO ${this.tableName} (forecast, time, created_at, location_id) VALUES ($1, $2, $3, $4,);`;
    const values = [this.forecast, this.time, this.created_at, location_id];

    client.query(SQL, values);
  }
}

function Movie(movie) {
  this.title = movie.title;
  this.released_on = movie.release_date;
  this.total_votes = movie.vote_count;
  this.average_votes = movie.vote_average;
  this.popularity = movie.popularity;
  this.image_url = `http://image.tmdb.org/t/p/w185${movie.backdrop_path}`; //not working
  this.overview = movie.overview;
}

function Yelp(location) {
  this.url = location.url;
  this.name = location.name;
  this.rating = location.rating;
  this.price = location.price;
  this.image_url = location.image_url;
}

function Meetups(meetup) {
  this.link = meetup.link;
  this.name = meetup.name;
  this.host = meetup.group.name;
  this.creation_date = new Date(meetup.created * 1000).toString().slice(0, 15);
  //this.creation_date = meetup.created;
}

function Trails(trail) {
  this.trail_url = trail.url;
  this.name = trail.name;
  this.location = trail.location;
  this.length = trail.length;
  this.condition_date = trail.conditionDate;
  this.condition_time = trail.conditionDate;
  this.conditions = trail.conditionStatus;
  this.stars = trail.stars;
  this.star_votes = trail.starVotes;
}

// ++++++++++++ HELPERS +++++++++++++++
// These functions are assigned to properties on the models

// Checks to see if there is DB data for a given location
function lookup(options) {
  const SQL = `SELECT * FROM ${options.tableName} WHERE location_id=$1;`;
  const values = [options.location];

  client.query(SQL, values)
    .then(result => {
      if (result.rowCount > 0) {
        options.cacheHit(result);
      } else {
        options.cachMiss();
      }
    })
    .catch(error => handleError(error));
}

//Clear the DB data for a location if it's stale
function deleteByLocationId(table, city) {
  const SQL = `DELETEE from ${table} WHERE location_id=${city};`;
  return client.query(SQL);
}

function searchToLatLong(query) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;

  return superagent.get(url)
    .then(res => {
      console.log(new Location(query, res))
      return new Location(query, res);
    })
    .catch(error => handleError(error));
}

// ++++++++++++ HANDLERS ++++++++++++++++

// Error handler
function handleError(err, res) {
  console.error(err);
  if (res) res.status(500).send('Sorry, something went wrong');
}

// Location handler
function getLocation(request, response) {
  Location.lookupLocation({
    tableName: Location.tableName,

    query: request.query.data,

    cacheHit: function (result) {
      console.log(result.rows[0]);
      response.send(result.rows[0]);
    },

    cacheMiss: function() {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${this.query}&key=${process.env.GEOCODE_API_KEY}`;

      return superagent.get(url)
        .then(result => {
          const location = new Location(this.query, result);
          location.save()
            .then(location => response.send(location));
        })
        .catch(error => handleError(error));
    }
  })
}


function getWeather(request, response) {
  Weather.lookup({
    tableName: Weather.tableName,

    location: request.query.data.id,

    cacheHit: function (result) {
      let ageOfResultsInMinutes =  (Date.now() - result.rows[0].created_at) / (1000 * 60);
      if (ageOfResultsInMinutes > 30) {
        Weather.deleteByLocationId(Weather.tableName, request.query.data.id);
        this.cacheMiss();
      } else {
        response.send(result.rows);
      }
    },

    cacheMiss: function() {
      const url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${request.query.data.latitude},${request.query.data.longitude}`;

      return superagent.get(url)
        .then(result => {
          const weatherSummaries = result.body.daily.data.map(day => {
            const summary = new Weather(day);
            summary.save(request.query.data.id);
            return summary;
          });
          response.send(weatherSummaries);
        })
        .catch(error => handleError(error, response));
    }
  })
}


function getMovies(request, response) {
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.THEMOVIEDB_API_KEY}&language=en-US&query=${request.query.data.search_query}`;

  superagent.get(url)
    .then(result => {
      const movieSummaries = result.body.results.map(movie => {
        return new Movie(movie);
      })
      response.send(movieSummaries);
    })
    .catch(error => handleError(error, response));
}

function getYelp(request, response) {
  const url = `https://api.yelp.com/v3/businesses/search?latitude=${request.query.data.latitude}&longitude=${request.query.data.longitude}`;

  superagent.get(url)
    .set(`authorization`, `Bearer ${process.env.YELP_API_KEY}`)
    .then(result => {
      const yelpSummaries = result.body.businesses.map(location => {
        return new Yelp(location);
      })
      response.send(yelpSummaries);
    })
    .catch(error => handleError(error, response));
}

function getMeetups(request, response) {
  const url = `https://api.meetup.com/find/upcoming_events?sign=true&photo-host=public&lon=${request.query.data.longitude}&page=20&radius=1&lat=${request.query.data.latitude}&key=${process.env.MEETUP_API_KEY}`;

  superagent.get(url)
    .then(result => {
      const meetupSummaries = result.body.events.map(meetup => {
        return new Meetups(meetup);
      })
      response.send(meetupSummaries);
    })
    .catch(error => handleError(error, response));
}

function getTrails(request, response) {
  const url = `https://www.hikingproject.com/data/get-trails?lat=${request.query.data.latitude}&lon=${request.query.data.longitude}&maxDistance=10&key=${process.env.TRAILS_API_KEY}`;
  superagent.get(url)
    .then(result => {
      const trailSummaries = result.body.trails.map(trail => {
        return new Trails(trail);
      })
      response.send(trailSummaries);
    })
    .catch(error => handleError(error, response));
}
