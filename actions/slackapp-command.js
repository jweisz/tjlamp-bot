/**
 * Copyright 2016 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the “License”);
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *  https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an “AS IS” BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var async = require('async');
var request = require('request');
const WebSocket = require('ws');


/**
 * Gets the details of a given user through the Slack Web API
 *
 * @param accessToken - authorization token
 * @param userId - the id of the user to retrieve info from
 * @param callback - function(err, user)
 */
function usersInfo(accessToken, userId, callback) {
    request({
        url: 'https://slack.com/api/users.info',
        method: 'POST',
        form: {
            token: accessToken,
            user: userId
        },
        json: true
    }, function (err, response, body) {
        if (err) {
            callback(err);
        } else if (body && body.ok) {
            callback(null, body.user);
        } else if (body && !body.ok) {
            callback(body.error);
        } else {
            callback('unknown response');
        }
    });
}

function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function hsv_to_rgb(h, s, v) {
    var h_i = parseInt(h*6);
    var f = h*6 - h_i;
    var p = v * (1 - s);
    var q = v * (1 - f*s);
    var t = v * (1 - (1 - f) * s);
    var r = 0;
    var g = 0;
    var b = 0;

    if (h_i == 0) {
        r = v;
        g = t;
        b = p;
    } else if (h_i == 1) {
        r = q;
        g = v;
        b = p;
    } else if (h_i == 2) {
        r = p;
        g = v;
        b = t;
    } else if (h_i == 3) {
        r = p;
        g = q;
        b = v;
    } else if (h_i == 4) {
        r = t;
        g = p;
        b = v;
    } else if (h_i == 5) {
        r = v;
        g = p;
        b = q;
    }
    return rgbToHex(parseInt(r*256), parseInt(g*256), parseInt(b*256))
}

function sendWebSocketCommand(cmd, arg, callback) {
    var msg = {};
    if (cmd == '/shine') {
        msg['cmd'] = 'shine';
        msg['color'] = arg;
    } else if (cmd == '/pulse') {
        msg['cmd'] = 'pulse';
        msg['color'] = arg;
    } else if (cmd == '/lamp') {
        if (arg == 'on') {
            msg['cmd'] = 'on';
        } else if (arg == 'off') {
            msg['cmd'] = 'off';
        }
    } else if (cmd == '/disco') {
        msg['cmd'] = 'shine';
        msg['color'] = 'disco';
    } else if (cmd == '/wave') {
        msg['cmd'] = 'wave';
    }

    // choose a random color?
    if (msg['color'] != undefined && msg['color'] == 'random') {
        var h = Math.random();
        var s = Math.random() * (1.0 - 0.5) + 0.5;
        var v = Math.random() * (1.0 - 0.5) + 0.5
        var color = hsv_to_rgb(h, s, v);
        msg['color'] = color;
        console.log("chose random color:", color);
    }

    if (msg['cmd'] != undefined) {
        const ws = new WebSocket('ws://tjlamp.mybluemix.net:80/lamp');
        ws.on('open', function open() {
            payload = JSON.stringify(msg);
            ws.send(payload);

            // status code 1000 indicates normal closure
            ws.close(1000);
            console.log("command sent successfully", payload);
            callback();
        });
    } else {
        console.log("Unable to parse command \"" + cmd + "\"");
        callback('Unable to parse command');
    }
}

function main(args) {
    console.log('Processing new bot command from Slack', args);

    // avoid calls from unknown
    if (args.token !== args.slackVerificationToken) {
        return {
            statusCode: 401
        }
    }

    // connect to the Cloudant database
    var cloudant = require('@cloudant/cloudant')({
        url: args.cloudantUrl,
        plugins: {
            iamauth: {
                iamApiKey: args.cloudantIAMAPIKey
            }
        }
    });
    var botsDb = cloudant.use(args.cloudantDb);

    // the command to process
    var command = {
        team_id: args.team_id,
        user_id: args.user_id,
        // the response url could be used to send the response later as part of another
        // action in the case we need to do more processing before being able to reply.
        response_url: args.response_url,
        command: args.command,
        text: args.text
    };

    if (args.command == '/lamp') {
        command['action_msg'] = `you turned the lamp ${args.text} 💡`;
    } else if (args.command == '/wave') {
        command['action_msg'] = `you made tjlamp wave! 💪`;
    } else {
        command['action_msg'] = `you made the light ${args.command.substr(1)} ${args.text}! 💡`
    }

    return new Promise(function (resolve, reject) {
        async.waterfall([
                // open the websocket and send the command
                function (callback) {
                    console.log('Parsing the request');
                    sendWebSocketCommand(command.command, command.text, function (err) {
                        callback(err);
                    });
                },
                // find the token for this bot
                function (callback) {
                    console.log('Looking up bot info for team', command.team_id);
                    botsDb.view('bots', 'by_team_id', {
                        keys: [command.team_id],
                        limit: 1,
                        include_docs: true
                    }, function (err, body) {
                        if (err) {
                            callback(err);
                        } else if (body.rows && body.rows.length > 0) {
                            callback(null, body.rows[0].doc.registration)
                        } else {
                            callback('team not found');
                        }
                    });
                },
                // grab info about the user
                function (registration, callback) {
                    console.log('Looking up user info for user', command.user_id);
                    usersInfo(registration.bot.bot_access_token, command.user_id, function (err, user) {
                        callback(err, registration, user);
                    });
                },
                // reply to the message
                function (registration, user, callback) {
                    console.log('User info', user);
                    callback(null, `Hey ${user.profile.display_name}, ${command.action_msg}`);
                }
            ],
            function (err, response) {
                if (err) {
                    console.log('Error', err);
                    reject({
                        body: err
                    });
                } else {
                    resolve({
                        body: response
                    });
                }
            }
        );
    });
}