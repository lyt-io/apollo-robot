var five    = require('johnny-five');
var port    = process.env.PORT || 8080;
var server  = require('http').createServer(function(req, res){
    // Send HTML headers and message
    res.writeHead(200,{ 'Content-Type': 'text/html' });
    res.end('<h1>The cat robot is working.</h1>');
});
var io      = require('socket.io')(server);

server.listen(port, function () {
  console.log('Server listening at port %d', port);
});

// Camera
var spawn = require('child_process').spawn;
var streamer = null;
var servoX;
var servoY;
var cameraX = 90;
var cameraY = 180;
var cameraIncrement = 15;

function cameraTo (x, y) {
    if (x > 180) { x = 180; }
    if (x < 0) { x = 0; }
    if (y > 180) { y = 180; }
    if (y < 0) { y = 0; }
    cameraX = x;
    servoX.to(cameraX);
    cameraY = y;
    servoY.to(cameraY);
    io.emit('camera moved', {
        x: cameraX,
        y: cameraY
    });
}

// Motors
var motor1;
var motor2;
var motor3;
var motor4;
var motorSpeed = 255;

var proximity1;

// Arduino
var board = new five.Board();
board.on('ready', function() {

    console.log('Arduino connected');
    
    servoX = new five.Servo(5);
    servoY = new five.Servo(3);
    servoX.to(cameraX);
    servoY.to(cameraY);

    // Front left
    motor1 = new five.Motor({
        pins: {
            pwm: 6,
            dir: 15,
            cdir: 4
        }
    });
    // Front right
    motor3 = new five.Motor({
        pins: {
            pwm: 10,
            dir: 2,
            cdir: 8
        }
    });

    // Back left
    motor2 = new five.Motor({
        pins: {
            pwm: 9,
            dir: 14,
            cdir: 7
        }
    });
    // Back right
    motor4 = new five.Motor({
        pins: {
            pwm: 11,
            dir: 13,
            cdir: 12
        }
    });

    proximity1 = new five.Proximity({
        controller: 'HCSR04',
        pin: 16
    });

    proximity1.on('data', function() {
        //io.sockets.emit('proximity1', this.in);
        console.log(this.in);
    });

});

// Chatroom
var usernames = {};
var numUsers = 0;

// Socket connection handler
io.on('connection', function (socket) {

    console.log('Connection to client established');
    
    var addedUser = false;

    if(streamer === null) {
        var args = [
            '-i', '/opt/mjpg-streamer/input_raspicam.so -fps 15 -q 50 -x 640 -y 360', 
            '-o', '/opt/mjpg-streamer/output_http.so -p 9000 -w /opt/mjpg-streamer/www'
        ];
        streamer = spawn('/opt/mjpg-streamer/mjpg_streamer', args, { stdio: 'inherit' });
    }

    socket.on('add user', function (username) {
        socket.username = username;
        // add the client's username to the global list
        usernames[username] = username;
        ++numUsers;
        addedUser = true;
        socket.emit('login', {
            numUsers: numUsers
        });
        socket.broadcast.emit('user joined', {
            username: socket.username,
            numUsers: numUsers
        });
        console.log(socket.username + ' joined the party.')
    });

    socket.on('new message', function (data) {
        socket.broadcast.emit('new message', {
            username: socket.username,
            message: data
        });
    });

    socket.on('disconnect', function () {
        // remove the username from global usernames list
        if (addedUser) {
            delete usernames[socket.username];
            --numUsers;

            socket.broadcast.emit('user left', {
                username: socket.username,
                numUsers: numUsers
            });
            console.log(socket.username + ' left the party.');
        }
        // no more sockets, kill the stream
        if (numUsers == 0 && streamer) {
            streamer.kill()
            streamer = null
        }
    });

    socket.on('camera up', function () {
        cameraY = cameraY - cameraIncrement;
        cameraTo(cameraX, cameraY);
        io.sockets.emit('controlling', {
            username: socket.username,
            part: 'camera',
            action: 'arrow-up'
        });
    });
    socket.on('camera right', function () {
        cameraX = cameraX - cameraIncrement;
        cameraTo(cameraX, cameraY);
        io.sockets.emit('controlling', {
            username: socket.username,
            part: 'camera',
            action: 'arrow-right'
        });
    });
    socket.on('camera down', function () {
        cameraY = cameraY + cameraIncrement;
        cameraTo(cameraX, cameraY);
        io.sockets.emit('controlling', {
            username: socket.username,
            part: 'camera',
            action: 'arrow-down'
        });
    });
    socket.on('camera left', function () {
        cameraX = cameraX + cameraIncrement;
        cameraTo(cameraX, cameraY);
        io.sockets.emit('controlling', {
            username: socket.username,
            part: 'camera',
            action: 'arrow-left'
        });
    });
    socket.on('motor forward', function () {
        motor1.forward(motorSpeed);
        motor2.reverse(motorSpeed);
        motor3.forward(motorSpeed);
        motor4.reverse(motorSpeed);
        io.sockets.emit('controlling', {
            username: socket.username,
            part: 'motor',
            action: 'arrow-up'
        });
    });
    socket.on('motor reverse', function () {
        motor1.reverse(motorSpeed);
        motor2.forward(motorSpeed);
        motor3.reverse(motorSpeed);
        motor4.forward(motorSpeed);
        io.sockets.emit('controlling', {
            username: socket.username,
            part: 'motor',
            action: 'arrow-down'
        });
    });
    socket.on('motor left', function () {
        motor1.reverse(motorSpeed);
        motor2.forward(motorSpeed);
        motor3.forward(motorSpeed);
        motor4.reverse(motorSpeed);
        io.sockets.emit('controlling', {
            username: socket.username,
            part: 'motor',
            action: 'arrow-left'
        });
    });
    socket.on('motor right', function () {
        motor1.forward(motorSpeed);
        motor2.reverse(motorSpeed);
        motor3.reverse(motorSpeed);
        motor4.forward(motorSpeed);
        io.sockets.emit('controlling', {
            username: socket.username,
            part: 'motor',
            action: 'arrow-right'
        });
    });
    socket.on('motor stop', function () {
        motor1.stop();
        motor2.stop();
        motor3.stop();
        motor4.stop();
    });
});