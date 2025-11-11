import express from 'express';
import mysql from 'mysql2/promise';

const app = express();

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({extended:true}));

const pool = mysql.createPool({
    host: "",
    user: "",
    password: "",
    database: "",
    connectionLimit: 10,
    waitForConnections: true
});

app.get('/', (req, res) => {
   res.render('home.ejs')
});

app.get('/login', (req, res) => {
    res.render('login.ejs')
});

app.get('/signup', (req, res) => {
    res.render('signup.ejs')
});

app.get('/library', (req, res) => {
    res.render('library.ejs')
});

app.get('/adding', (req, res) => {
    res.render('adding.ejs')
});

app.get('/searching', (req, res) => {
    res.render('searching.ejs')
});

app.get('/profile', (req, res) => {
    res.render('profile.ejs')
});

app.get('/discover', (req, res) => {
    res.render('discover.ejs')
});

app.get('/deleting', (req, res) => {
    res.render('deleting.ejs')
});

app.listen(3000, ()=>{
    console.log("Express server running")
});