const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000");
    });
  } catch (error) {
    console.log(`DataBase Error: ${error.message}`);
    process.exit(1);
  }
};
initializeDbAndServer();

//GETTING ARRAY OF USER FOLLOWING ID'S

const getFollowingPeopleIdsOfUser = async (username) => {
  const getTheFollowingPeopleQuery = `
    SELECT following_user_id 
    FROM follower INNER JOIN user ON user.user_id = follower.follower_user_id
    WHERE user.username='${username}';
    `;

  const followingPeople = await database.all(getTheFollowingPeopleQuery);
  const arrayOfIds = followingPeople.map(
    (eachUser) => eachUser.following_user_id
  );
  return arrayOfIds;
};

//Authentication
const authenticateToken = (request, response, next) => {
  const { tweet } = request.body;
  const { tweetId } = request.params;
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.payload = payload;
        request.tweet = tweet;
        request.tweetId = tweetId;
        next();
      }
    });
  }
};

//1 Register API-1
app.post("/register/", async (request, response) => {
  const { username, name, password, gender } = request.body;
  const selectUserQuery = `
    SELECT *
    FROM user
    WHERE
    username = '${username}';`;
  const userDetails = await database.get(selectUserQuery);
  if (userDetails !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `
            INSERT INTO
            user (username, name, password, gender)
            VALUES (
                '${username}',
                '${name}',
                '${hashedPassword}',
                '${gender}'
            );`;
      await database.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  }
});

//2 Login API-2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `
    SELECT *
    FROM user 
    WHERE 
    username = '${username}';`;
  const dbUser = await database.get(getUserQuery);
  if (dbUser !== undefined) {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched) {
      const jwtToken = jwt.sign(dbUser, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

//3 Get latest tweets API-3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const getTweetsFeedQuery = `
  SELECT 
    username,
    tweet, 
    date_time AS dateTime
  FROM
    follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id INNER JOIN user ON user.user_id = follower.following_user_id
  WHERE 
    follower.follower_user_id = ${user_id} 
  ORDER BY 
    date_time DESC
  LIMIT 4 ;`;
  const tweetFeedQuery = await database.all(getTweetsFeedQuery);
  response.send(tweetFeedQuery);
});

//4 Get user following User Name API-4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const userFollowsQuery = `
    SELECT 
     name
    FROM
     follower INNER JOIN user
    ON user.user_id = follower.following_user_id
    WHERE 
     follower.follower_user_id = '${user_id}';`;
  const userFollowsArray = await database.all(userFollowsQuery);
  response.send(userFollowsArray);
});

//5 Get User Names Following API-5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const userFollowersQuery = `
    SELECT DISTINCT
        name
    FROM 
        user INNER JOIN follower ON user.user_id = follower.follower_user_id 
    WHERE 
        follower.following_user_id = '${user_id}';`;
  const userFollowersArray = await database.all(userFollowersQuery);
  response.send(userFollowersArray);
});

//6 Get Tweet API-6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const tweetsQuery = `SELECT * FROM tweet WHERE tweet_id = ${tweetId};`;
  const tweetsResult = await database.get(tweetsQuery);
  const userFollowersQuery = `
    SELECT
        *
    FROM 
        user INNER JOIN follower ON user.user_id = follower.following_user_id
    WHERE
        follower.follower_user_id = ${user_id};`;
  const userFollowers = await database.all(userFollowersQuery);

  if (
    userFollowers.some(
      (item) => item.following_user_id === tweetsResult.user_id
    )
  ) {
    const getTweetDetailsQuery = `
        SELECT 
            tweet,
            COUNT(DISTINCT(like.like_id)) AS likes,
            COUNT(DISTINCT(reply.reply_id)) AS replies,
            tweet.date_time AS dateTime
        FROM
            tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id INNER JOIN reply ON reply_tweet_id = tweet.tweet_id 
        WHERE
            tweet.tweet_id = ${tweetId}  AND  tweet.user_id=${userFollowers[0].user_id};`;
    const tweetDetails = await database.get(getTweetDetailsQuery);
    response.send(tweetDetails);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

// 7 Get Tweet Liked Users API-7
app.get(
  "/tweets/:tweetId/likes",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request;
    const { payload } = request;
    const { user_id, name, username, gender } = payload;
    const getLikedUserQuery = `
        SELECT 
            *
        FROM 
            follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id 
            INNER JOIN user ON user.user_id = like.user_id
        WHERE
            tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id};`;
    const likedUsers = await database.all(getLikedUserQuery);
    if (likedUsers.length !== 0) {
      let likes = [];
      const getNamesArray = (likedUsers) => {
        for (let item of likedUsers) {
          likes.push(item.username);
        }
      };
      getNamesArray(likedUsers);
      response.send({ likes });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//8 Get Tweet Replied Users API-8
app.get(
  "/tweets/:tweetId/replies",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request;
    const { payload } = request;
    const { user_id, name, username, gender } = payload;
    const getRepliedUsersQuery = `
    SELECT 
        * 
    FROM
        follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
        INNER JOIN user ON user.user_id = reply.user_id
    WHERE 
        tweet.tweet_id = ${tweetId} AND follower.follower_user_id  = ${user_id};`;
    const repliedUsers = await database.all(getRepliedUsersQuery);
    if (repliedUsers.length !== 0) {
      let replies = [];
      const getNamesArray = (repliedUsers) => {
        for (let item of repliedUsers) {
          let object = {
            name: item.name,
            reply: item.reply,
          };
          replies.push(object);
        }
      };
      getNamesArray(repliedUsers);
      response.send({ replies });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//9 Get All Tweet of User API-9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const getTweetsDetailsQuery = `
    SELECT 
        tweet,
        COUNT(DISTINCT likes_id) AS likes,
        COUNT(DISTINCT reply_id) AS replies,
        date_time AS dateTime
    FROM 
        tweet LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id LEFT JOIN like ON tweet.tweet_id = like.tweet_id
    WHERE 
        tweet.user_id = ${user_id} 
    GROUP BY
        tweet.tweet_id;`;
  const tweetDetails = await database.get(getTweetsDetailsQuery);
  response.send(tweetDetails);
});

//Get Post Tweet API-10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request;
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const postTweetQuery = `
        INSERT INTO
            tweet (tweet, user_id)
        VALUES (
            '${tweet}',
            ${user_id}
        );`;
  await database.run(postTweetQuery);
  response.send("Created a Tweet");
});

//Delete Tweet API - 11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request;
    const { payload } = request;
    const { user_id, name, username, gender } = payload;
    const selectUserQuery = `
    SELECT *
    FROM 
        tweet 
    WHERE 
        user_id = '${user_id}' AND tweet_id = '${tweetId}';`;
    const tweetUser = await database.get(selectUserQuery);
    if (tweetUser === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweetQuery = `
        DELETE FROM tweet
        WHERE
            tweet_id = '${tweetId}';`;
      await database.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);

//Exporting the express instance
module.exports = app;
