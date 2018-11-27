'use strict';

// Application Dependencies
const express = require('express');
const superagent = require('superagent');
const cors = require('cors');

// Load environment variables from .env file
require('dotenv').config();

// Application Setup
const app = express();
const PORT = process.env.PORT;
app.use(cors());

// API Routes
app.get('/location', (request, response) => {
  searchToLatLong(request.query.data)
    .then(location => response.send(location))
    .catch(error => handleError(error, response));
})

app.get('/weather', getWeather);
app.get('/movies', getMovies);
app.get('/yelp', getYelp);
app.get('/meetups', getMeetups);
// app.get('/trails', getTrails);

// Make sure the server is listening for requests
app.listen(PORT, () => console.log(`Listening on ${PORT}`));

// Error handler
function handleError(err, res) {
  console.error(err);
  if (res) res.status(500).send('Sorry, something went wrong');
}

// Models
function Location(query, res) {
  this.search_query = query;
  this.formatted_query = res.body.results[0].formatted_address;
  this.latitude = res.body.results[0].geometry.location.lat;
  this.longitude = res.body.results[0].geometry.location.lng;
}

function Weather(day) {
  this.forecast = day.summary;
  this.time = new Date(day.time * 1000).toString().slice(0, 15);
}

function Movie(movie) {
  this.title = movie.title;
  this.released_on = movie.release_date;
  this.total_votes = movie.vote_count;
  this.average_votes = movie.vote_average;
  this.popularity = movie.popularity;
  this.image_url = movie.backdrop_path; //not working
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
  this.creation_date = meetup.created;
}

// function Trails(trail) {
//   this.url = trail.trail_url;
//   this.name = trail.name;
//   this.location = trail.location;
//   this.distance = trail.length;
//   this.date = trail.condition_time;
//   this.time = trail.condition_time;
//   this.conditions = trail.conditions;
//   this.rating = trail.stars;
//   this.max_rating = trail.star_votes;
// }

// Helper Functions
function searchToLatLong(query) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;

  return superagent.get(url)
    .then(res => {
      console.log(new Location(query, res))
      return new Location(query, res);
    })
    .catch(error => handleError(error));
}

function getWeather(request, response) {
  const url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${request.query.data.latitude},${request.query.data.longitude}`;

  superagent.get(url)
    .then(result => {
      const weatherSummaries = result.body.daily.data.map(day => {
        return new Weather(day);
      });
      response.send(weatherSummaries);
    })
    .catch(error => handleError(error, response));
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
      //console.log(result.body.results);
      const meetupSummaries = result.body.events.map(meetup => {
        console.log(meetup)
        return new Meetups(meetup);
      })
      //console.log(meetupSummaries)
      response.send(meetupSummaries);
    })
    .catch(error => handleError(error, response));
}

function getTrails() {
  // const url = ;

  // superagent.get(url)
  //   .then(result => {

  //   })
  //   .catch(error => handleError(error, response));
}
