import express from 'express';
import mysql from 'mysql2/promise';
import session from 'express-session';

const app = express();
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({extended:true}));

app.use(
  session({
    secret: 'dev-secret-change-me',   // TODO: move to env var in prod
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 }, // 8h
  })
);

// make `user` available in all EJS views as res.locals.user
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

const isLoggedIn = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }
  next();
};

//log into PHP to see database with these credentials
const pool = mysql.createPool({
    host: "s54ham9zz83czkff.cbetxkdyhwsb.us-east-1.rds.amazonaws.com",
    user: "aly2chc1emeviz7l",
    password: "k0jghsw8hzro9yz4",
    database: "zhxbq00kjl80ezxz",
    connectionLimit: 10,
    waitForConnections: true
});

//haven't implemented APIs for discover section 
//haven't made friends section
app.get('/', (req, res) => {
    res.render('home.ejs', {friendsFeed:[], discover:[] });
});


//================================= LOG IN PAGE ===========================================
app.get('/auth/login', (req, res) => {
    res.render('login.ejs')
});

app.post('/auth/login', async(req,res) => {
    const {username, password} = req.body;
    let sql = `SELECT id, username FROM users WHERE username = ? AND password = ? LIMIT 1`;
    const [rows] = await pool.query(sql, [username, password]);

    if (rows.length === 1) {
        req.session.user = rows[0]; //id, username
        return res.redirect('/');
    }

    //if failed
    res.status(401).render('login.ejs', {error: 'Invalid Credentials'});
})

//----- for Logout button ------
app.post('/auth/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
})

//================================= SIGN UP PAGE ========================================
app.get('/auth/signup', (req, res) => {
    res.render('signup.ejs')
});

app.post('/auth/signup', async(req, res) => {
    const {username, password, confirmPass} = req.body;

    //check all fields filled
    if(!username || !password || !confirmPass){
        return res.status(400).render('signup.ejs', {error: 'All fields are required.'});
    }
    
    //check pass and confirmPass match
    if(password != confirmPass){
        return res.status(400).render('signup.ejs', {error: 'Passwords do not match.'});
    }

    if(password.length < 6){
        return res.status(400).render('signup.ejs', {error:'Password must be at least 6 characters.'});
    }

    //check if username is available
    let sql = `SELECT id FROM users WHERE username = ?`;
    const[exists] = await pool.query(sql, [username]);
    if(exists.length){ //if there is a length to exists that means it exists
        return res.status(409).render('signup.ejs', {error: 'Username is already taken.'});
    }

    let insert = `INSERT INTO users (username, password, date_joined) VALUES (?, ?, NOW())`;
    const [result] = await pool.query(insert, [username, password]);

    //automatically log in after sign up
    req.session.user = {id: result.insertId, username};
    return res.redirect('/');
});

app.post('/reviews', isLoggedIn, async (req, res) => {
    const { title, artist, genre, rating, comment } = req.body;
    const userId = req.session.user.id;

    if (!title || !artist || !rating) {
        return res.status(400).render('home.ejs', {
            error: 'Title, Artist, and Rating need to be filled in.', friendsFeed: [], discover: []
        });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        let [existingSong] = await conn.query('SELECT id FROM songs WHERE Title = ? AND Artist = ? LIMIT 1', [title, artist]);
        let songId;

        if (existingSong.length === 0) {
            const [songInsert] = await conn.query('INSERT INTO songs (Title, Artist, Genre) VALUES (?, ?, ?)', [title, artist, genre || null]);
            songId = songInsert.insertId;
        }
        else {
            songId = existingSong[0].id;
        }

        await conn.query('INSERT INTO reviews (User_id, Song_id, Rating, Comment, Date_reviewed) VALUES (?, ?, ?, ?, NOW())', [userId, songId, rating, comment || null]);
        await conn.commit();
        res.redirect('/');
    } 
    catch (err) {
        await conn.rollback();
        console.error("Error adding song or review:", err);
        res.status(500).render('home.ejs', {error: 'An error occurred. Try again!', friendsFeed: [], discover: []});
    }
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

app.listen(3000, ()=> {
    console.log("Express server running")
});