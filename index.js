var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

var fs = require('fs');
var creds = '';

var redis = require('redis');
var client = '';

var port = 8080;
http.listen(port, function () {
    console.log('Server started... listening on port:' + port);
});

app.get('/', function (req, res) {
    res.sendFile('views/index.html', {
        root: __dirname
    });
});

app.use(express.static('public'));
app.use(bodyParser.urlencoded({
    extended: true
}));

var users = [];
var chat_messages = [];

client = redis.createClient();
client.once('ready', function () {
    client.get('usrs', function (err, reply) {
        if (reply) {
            users = JSON.parse(reply);
        }
    });

    client.get('msgs', function (err, reply) {
        if (reply) {
            chat_messages = JSON.parse(reply);
        }
    });
});
    

// Creates a user in chat room
app.post('/create-user', function (req, res) {
    var username = req.body.username;
    if (users.indexOf(username) === -1) {
        users.push(username);
        client.set('usrs', JSON.stringify(users));
        res.send({
            'users': users,
            'status': 200
        });
    } else {
        res.send({
            'status': 404
        });
    }
});

// Creates and stores new message
app.post('/chats', function (req, res) {
    if(typeof req.body.username === 'undefined' || typeof req.body.text === 'undefined' || isNaN(req.body.timeout)){
        res.send({
            'status': 404
        });
    } else {
        var username = req.body.username;
        var text = req.body.text;
        var timeout = req.body.timeout;
        
        var expiration_date = new Date(Date.now());
        expiration_date.setSeconds(expiration_date.getSeconds() + 60);
        var id = Math.floor(Date.now() + Math.random());

        chat_messages.push({
            'username': username,
            'text': text,
            'expiration_date': expiration_date,
            'timeout': timeout,
            'id': id
        });
        client.set('msgs', JSON.stringify(chat_messages));
        res.status(201);
        res.json({"id": id});
    }
});

// Gets the message associated with the id regardless of the expiration date
app.get('/chats/:id(\\d+)', function (req, res) {
    var messageWithId = chat_messages.find(m => m.id == req.params.id);
    if(!messageWithId) res.status(404).send('A message with that id does not exist.');
    res.status(200);
    res.json({
        "username": messageWithId.username,
        "text": messageWithId.text,
        "expiration_date": messageWithId.expiration_date
    });
});

// Gets the message associated with the username considering the expiration date
app.get('/chats/:username', function (req, res) {
    var currentTime = new Date(Date.now()).getTime();
    var messagesWithUsername = chat_messages.filter(c => c.username === req.params.username);
    var unexpiredMessages = [];
    for(var x in messagesWithUsername){
        var expirationTime = new Date(messagesWithUsername[x].expiration_date).getTime();
        var difference = Math.floor((expirationTime - currentTime) / 1000);
        if(difference > 0){
            unexpiredMessages.push(messagesWithUsername[x]);
        }
    }
    var result = unexpiredMessages.map(u => ({id: u.id, text: u.text}));
    res.status(200);
    res.send(result);
});

app.delete('/chats/remove/:id', function (req, res) {
    var messageId = req.params.id;

    var messageToBeDeleted = chat_messages.filter(m => m.id === messageId);
    if(messageToBeDeleted){
        var index = chat_messages.indexOf(messageToBeDeleted);
        chat_messages.splice(index, 1);
        res.status(200);
        res.json({ "message" : "Message "+messageId+" deleted."});
    } else {
        res.status(404);
        res.json({ "message" : "Message "+messageId+" does not exist."});
    }

});


// Get all messages
app.get('/messages', function (req, res) {
    res.send(chat_messages);
});

// Gets all users 
app.get('/users', function (req, res) {
    res.send(users);
});


io.on('connection', function (socket) {
    socket.on('text', function (data) {
        io.emit('send', data);
    });
});