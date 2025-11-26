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
app.get('/', async (req, res) => {
    let myReviews = [];
    if (req.session.user) {
        const userId = req.session.user.id;
        const sql = `
        SELECT reviews.id as reviewId, songs.Title, songs.Artist
        FROM reviews
        JOIN songs ON reviews.Song_id = songs.id
        WHERE reviews.User_id = ?`;

        const [rows] = await pool.query(sql, [userId]);
        myReviews = rows;
    }
    res.render('home.ejs', {friendsFeed:[], discover:[], myReviews: myReviews });
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

app.post('/reviews/delete', isLoggedIn, async (req, res) => {
    const { reviewId } = req.body;
    if (!reviewId) {
        return res.redirect('/');
    }

    try {
        await pool.query('DELETE FROM reviews WHERE id = ? AND User_id = ?',
        [reviewId, req.session.user.id]);
        res.redirect('/');
    }
    catch (err) {
        console.error("Error deleting review:", err);
        res.status(500).send("Error deleting review");
    }
});

app.get('/lyrics', async(req, res) => {
    let artist = req.query.artist;
    let title = req.query.title;

    if(!artist || !title){
        return res.render('lyrics.ejs',{
            artist:"",
            title:"",
            lyrics:null,
            error:null
        });
    }
    try{
        let url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
        let response = await fetch(url);

        if (!response.ok) {
            throw new Error(`API returned status: ${response.status}`);
        }
        let data = await response.json();

        // This would only run if the lyrics aren't found
        if(!data.lyrics){
            return res.render('lyrics.ejs',{
                artist,
                title,
                lyrics:null,
                error:"Lyrics not found."
            });
        }

        // Successfully runs
        return res.render('lyrics.ejs',{
            artist,
            title,
            lyrics:data.lyrics,
            error:null
        });

    }catch(err){
        console.error("Lyrics API Error:",err);

        return res.render('lyrics.ejs',{
            artist,
            title,
            lyrics:null,
            error:"Error getting lyrics"
        });
    }
   // res.render('library.ejs')
});

app.get('/searching', async(req, res) => {
    let term = (req.query.q || "").trim();

    if(!term){
        return res.render('searching.ejs',{
            term:"",
            results: [],
            error:null
        });
    }

    try{
        let url = 
        "https://itunes.apple.com/search"
            + "?term=" + encodeURIComponent(term)
            + "&media=music"
            + "&entity=song"
            + "&limit=20"
            + "&country=US";
        let response = await fetch(url);
        let data = await response.json();

        let results = data.results || [];

        return res.render('searching.ejs',{
            term,
            results,
            error: results.length? null : "No songs found"
        });
    }catch (err){
        console.error("iTunes search error:",err);

        return res.render('searching.ejs',{
            term,
            results: [],
            error: "Error getting search results from iTunes"
        });
    }
    //res.render('searching.ejs')
});

app.get('/library', (req, res) => {
    res.render('library.ejs')
});

app.get('/adding', (req, res) => {
    res.render('adding.ejs')
});

app.get('/profile', (req, res) => {
    res.render('profile.ejs')
});

app.get('/discover', async (req, res) => {
    const genres = ['Pop', 'Rock', 'Metal', 'Rap', 'Electronic', 'Country', 'R&B', 'Jazz'];
    const fetchGenre = async (genre) => {
        try {
            const url = "https://itunes.apple.com/search"
            + "?term=" + encodeURIComponent(genre)
            + "&media=music"
            + "&entity=song"
            + "&limit=50"
            + "&country=US";
            const response = await fetch(url);
            const data = await response.json();
            let songs = data.results || [];

            for (let i = songs.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [songs[i], songs[j]] = [songs[j], songs[i]];
            }
            return {
                genre: genre,
                songs: songs.slice(0, 7)
            };
        } catch (err) {
            console.error(`Error fetching ${genre}:`, err);
            return { genre: genre, songs: [] };
        }
    };

    const discoverData = await Promise.all(genres.map(fetchGenre));
    res.render('discover.ejs', {
        discoverData,
        user: req.session.user || null
    });
});

app.get('/deleting', (req, res) => {
    res.render('deleting.ejs')
});

app.listen(3000, ()=> {
    console.log("Express server running")
});