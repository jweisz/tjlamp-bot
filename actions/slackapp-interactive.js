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

function sendWebSocketCommand(cmd, callback) {
    var msg = {};
    if (cmd == 'on') {
        msg['cmd'] = 'on';
    } else if (cmd == 'off') {
        msg['cmd'] = 'off';
    } else if (cmd.split('-')[1] == 'pulse') {
        msg['cmd'] = 'pulse';
        msg['color'] = cmd.split('-')[0];
    } else if (cmd == 'wave') {
        msg['cmd'] = 'wave';
    } else {
        msg['cmd'] = 'shine';
        msg['color'] = cmd.split('-')[0];
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
    console.log('Processing new interactive bot event from Slack', args);
    
    var response = JSON.parse(args.payload);

    // avoid calls from unknown
    if (response.token !== args.slackVerificationToken) {
        return {
            statusCode: 401
        }
    }

    // handle the registration of the Event Subscription callback
    // Slack will send us an initial POST
    // https://api.slack.com/events/url_verification
    if (args.__ow_method === 'post' &&
        args.type === 'url_verification' &&
        args.token === args.slackVerificationToken &&
        args.challenge) {
        console.log('URL verification from Slack');
        return {
            headers: {
                'Content-Type': 'application/json'
            },
            body: new Buffer(JSON.stringify({
                challenge: args.challenge
            })).toString('base64'),
        };
    }

    // get the event to process
    var interactive = {
        action: response.actions[0].value
    };
    
    return new Promise(function (resolve, reject) {
        async.waterfall([
                // open the websocket and send the command
                function (callback) {
                    console.log('Parsing the request');
                    sendWebSocketCommand(interactive.action, function(err) {
                        callback(err);
                    });
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