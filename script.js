"use strict";

document.addEventListener("DOMContentLoaded",init);
let worker;

async function init(){
    worker = new Worker('worker.js');
    document.querySelector("#accelPermsButton").addEventListener("click", getAccel);
    document.querySelector("#speed").addEventListener("input",updateSliderValue);
    document.querySelector("#speed").addEventListener("change",slowButtonOn);
}

function slowButtonOn(e){
  e.preventDefault();
  let slidervalue = document.querySelector("#speed").value;
  worker.postMessage(slidervalue);
  worker.onmessage = function(e){
    document.querySelector("#speed").value = e.data;
    motor_speed = e.data;
    log(e.data);
  }
}

async function updateSliderValue(e){
  e.preventDefault();
  let slidervalue = document.querySelector("#speed").value;
  motor_speed = slidervalue;
  log(document.querySelector("#speed").value);

}

//------------------------------------------------------------
// Accelerometers to control the Servo Motor (needs to be finalized)
//------------------------------------------------------------

let accelButton = document.querySelector("#accelPermsButton")
let operatingSystem = ""

if (typeof DeviceMotionEvent.requestPermission === 'function') {
  // iOS 13+
  accelButton.disabled = false
  accelButton.innerHTML = "Enable Accelerometer"
  operatingSystem = "iOS"
}
else if (window.DeviceMotionEvent != undefined) {
  // Android
  accelButton.disabled = false
  accelButton.innerHTML = "Enable Accelerometer"
  operatingSystem = "Android"
}
else {
  // Non supported devices
  accelButton.disabled = true
  accelButton.innerHTML = "Enable Accelerometer"
  operatingSystem = "other"

}

let rotation_degrees = 0;
let frontToBack_degrees = 0;
let leftToRight_degrees = 0;

let servoAngle = 90;

function getAccel(e) {
    e.preventDefault();
    if (operatingSystem == "iOS") { 
        DeviceMotionEvent.requestPermission().then(response => {
        if (response == 'granted') {
            getServoAngle();
        }
        });
    }
    else if (operatingSystem == "Android") {
        getServoAngle();

    }
}

function getServoAngle() {
  // Add a listener to get smartphone orientation 
  // in the alpha-beta-gamma axes (units in degrees)
  window.addEventListener('deviceorientation', (event) => {
    // Expose each orientation angle in a more readable way
    let alpha = event.alpha;
    let beta = event.beta;
    let gamma = event.gamma;

    let steeringangle = convertAngle(beta);

    let needle = document.getElementsByClassName("needle")[0]
    needle.setAttribute('style', "background: red");
	//You will need to adapt the angle for your needle to match what you have on your screen !
    needle.style.transform = "rotate(" + beta + "deg)";
    servoAngle = parseInt(steeringangle) //will be sent to BLE every Xms if there is a BLE connection
    //the parseInt HAS to be there, otherwise the conversion is hasardeous on the arduino side 
  });
}

function convertAngle(angle){
  if(angle > 70){
    return 160;
  }if(angle < -70){
    return 20;
  }
  return angle + 90;
}

//------------------------------------------------------------
// Once your done with the Servo Motor, time to go for the Motor !
// Don't forget to change the HTML accordingly.
//------------------------------------------------------------

let motor_speed = 0;


//------------------------------------------------------------
// BLE communication handling
//------------------------------------------------------------

// Get references to UI elements
let connectButton = document.getElementById('connect');
let disconnectButton = document.getElementById('disconnect');
let terminalContainer = document.querySelector("#log")
let inputField = document.getElementById('input');

let myInterval;

// Connect to the device on Connect button click
connectButton.addEventListener('click', function () {
    console.log("connecting")
    connect();
});

// Disconnect from the device on Disconnect button click
disconnectButton.addEventListener('click', function () {
    console.log("disconnecting")
  disconnect();
});

// Selected device object cache
let deviceCache = null;

// Launch Bluetooth device picker and connect to the selected device
//Here I use two things to make it easier to read :
//	1. I use p.then when p is a Promise which force operations to follow a certain order (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises) and (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/then)
//		With the syntax p.then(onFulfilled[, onRejected]);  Here, basically, we want sucesses to continue, otherwise we send an error.
//	2. I use arrow function (https://www.w3schools.com/js/js_arrow_function.asp) where :
//		function (s) { return s.length }
//			simply becomes :
//		s => s.length			(return by default if no {}, just giving parameters (s here) and no name
function connect() {
  return (deviceCache ? Promise.resolve(deviceCache) :
    requestBluetoothDevice()).
  then(device => connectDeviceAndCacheCharacteristic(device)).
  then(characteristic => startNotifications(characteristic)).
  then(myInterval = setInterval(sendingBLEinfo, 100)). // timing
  catch(error => log(error));
}

function requestBluetoothDevice() {
  log('Requesting bluetooth device...');

  return navigator.bluetooth.requestDevice({
    filters: [{
      services: [0xFFE0]
    }],
  }).
  then(device => {
    log('"' + device.name + '" bluetooth device selected');
    deviceCache = device;

    // Added line
    deviceCache.addEventListener('gattserverdisconnected',
      handleDisconnection);

    return deviceCache;
  });
}

function handleDisconnection(event) {
  let device = event.target;

  log('"' + device.name +
    '" bluetooth device disconnected, trying to reconnect...');

  connectDeviceAndCacheCharacteristic(device).
  then(characteristic => startNotifications(characteristic)).
  catch(error => log(error));
}


// Characteristic object cache
let characteristicCache = null;

// Connect to the device specified, get service and characteristic
function connectDeviceAndCacheCharacteristic(device) {
  if (device.gatt.connected && characteristicCache) {
    return Promise.resolve(characteristicCache);
  }

  log('Connecting to GATT server...');

  return device.gatt.connect().
  then(server => {
    log('GATT server connected, getting service...');

    return server.getPrimaryService(0xFFE0);
  }).
  then(service => {
    log('Service found, getting characteristic...');

    return service.getCharacteristic(0xFFE1);
  }).
  then(characteristic => {
    log('Characteristic found');
    characteristicCache = characteristic;

    return characteristicCache;
  });
}

// Enable the characteristic changes notification
function startNotifications(characteristic) {
  log('Starting notifications...');

  return characteristic.startNotifications().
  then(() => {
    log('Notifications started');
    // Added line
    characteristic.addEventListener('characteristicvaluechanged',
      handleCharacteristicValueChanged);
  });
}

function disconnect() {
  clearInterval(myInterval); //stop sending data every time
  if (deviceCache) {
    log('Disconnecting from "' + deviceCache.name + '" bluetooth device...');
    deviceCache.removeEventListener('gattserverdisconnected',
      handleDisconnection);

    if (deviceCache.gatt.connected) {
      deviceCache.gatt.disconnect();
      log('"' + deviceCache.name + '" bluetooth device disconnected');
    }
    else {
      log('"' + deviceCache.name +
        '" bluetooth device is already disconnected');
    }
  }

  // Added condition
  if (characteristicCache) {
    characteristicCache.removeEventListener('characteristicvaluechanged',
      handleCharacteristicValueChanged);
    characteristicCache = null;
  }

  deviceCache = null;
}

// Intermediate buffer for incoming data
let readBuffer = '';

// Data receiving
function handleCharacteristicValueChanged(event) {
  let value = new TextDecoder().decode(event.target.value); //We want to decode byte to text

  for (let c of value) { //we receve 20 bytes per 20 bytes, let's make one string until we reach \n
    if (c === '\n') { //Be careful, now we need to add a line break when we use the serial monitor
      let data = readBuffer.trim();
      readBuffer = '';

      if (data) {
        receive(data);
      }
    }
    else {
      readBuffer += c;
    }
  }
}

// Received data handling
function receive(data) {
  log(data, 'in');
}


function writeToCharacteristic(characteristic, data) {
  characteristic.writeValue(new TextEncoder().encode(data));
}


// Output to terminal
function log(data, type = '') {
  terminalContainer.insertAdjacentHTML('beforeend',
    '<div' + (type ? ' class="' + type + '"' : '') + '>' + data + '</div>');
    terminalContainer.scrollTop = terminalContainer.scrollHeight;
}

function send(data, logging = true) {
  data = String(data);

  if (!data || !characteristicCache) {
    return;
  }

  data += '\n';

  if (data.length > 20) {
    let chunks = data.match(/(.|[\r\n]){1,20}/g);

    writeToCharacteristic(characteristicCache, chunks[0]);

    for (let i = 1; i < chunks.length; i++) {
      setTimeout(() => {
        writeToCharacteristic(characteristicCache, chunks[i]);
      }, i * 100);
    }
  }
  else {
    writeToCharacteristic(characteristicCache, data);
  }

  if (logging) {
    log(data, 'out');
  }
}

function sendingBLEinfo() {
  send(`${servoAngle};${motor_speed}`, true);
}

