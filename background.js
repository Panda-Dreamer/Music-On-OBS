const serverURL = "http://127.0.0.1:4001";
var socket;

//SPOTIFY AUTH
const spotifySettings = {
  clientId: encodeURIComponent("d645ca3edc6e4394ab6b52d0f1bbd772"),
  responseType: encodeURIComponent("code"),
  redirectURI: "https://clecjadmjjoknaflecccgpjkojafeail.chromiumapp.org/",
  scope: encodeURIComponent("user-read-currently-playing"),
  showDialog: encodeURIComponent("true"),
  state: "",
};


//IMPORTS
try {
  importScripts("socket.io.js");

  socket = io(serverURL, {
    jsonp: false,
  });

  socket.on("connect", () => {
    console.log(socket.id);
  });
} catch (e) {
  console.error("SOCKET.IO DID NOT LOAD OR CONNECT!!!!!! EVERYTHING IS LOST (almost try to reload the extension and if the error persists send to the dev the error below and make sure to let them know it's PANIK time)");
  console.log(e);
}

try {
  importScripts("spotifyAPI.js");
  SpotifyAPIScanner();
} catch (e) {
  console.error("Spotify API scanner failed to load!");
  console.log(e);
}


//ADD SETTING
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    "extension-state": {
      stopped: true,
      scanners: [],
      selectedScanner: "",
    },
  });

  chrome.storage.local.set({
    "extension-scanner-state": {
      paused: false,
      title: "Default title",
      subtitle: "Defaut subtitle",
      currentTime: "",
      currentLength: "",
      url: "",
      cover: "",
    },
  });

  chrome.storage.local.set({
    "extension-settings": {
      instance: {
        privateToken: "",
        publicToken: "",
        serverURL: serverURL,
      },
      behaviour: {
        displayPause: false,
        smartSwitch: false,
        detectPause: true,
      },
      integration: {
        defaultMessage: "Current song: [__SONG__]",
        pausedMessage: "The music is currently paused",
        errorMessage: "Unable to get current song name!",
      },
      overlay: {
        primaryColor: "",
        secondaryColor: "",
        style: "",
      },
    },
  });

  chrome.storage.local.set({
    "extension-oauth": {
      spotify: {
        token: "",
        refreshToken: "",
        expiry: "",
        loggedIn: false,
      },
    },
  });
});

//SPOTIFY AUTH
function getSpotifyEndpoint() {
  spotifySettings.state = encodeURIComponent("meet" + Math.random().toString(36).substring(2, 15));
  let oauth2_url = `https://accounts.spotify.com/authorize
?client_id=${spotifySettings.clientId}
&response_type=${spotifySettings.responseType}
&redirect_uri=${spotifySettings.redirectURI}
&state=${spotifySettings.state}
&scope=${spotifySettings.scope}
&show_dialog=${spotifySettings.showDialog}
`;
  return oauth2_url;
}

function contactServer(channel, payload) {
  return new Promise((resolve, reject) => {
    socket.emit(channel, payload, (response) => {
      resolve(response);
    });
  });
}

async function syncServer() {
  let extensionScannerState = (await chrome.storage.local.get("extension-scanner-state"))["extension-scanner-state"];
  let extensionSettings = (await chrome.storage.local.get("extension-settings"))["extension-settings"];
  let extensionState = (await chrome.storage.local.get("extension-state"))["extension-state"];

  let data = {
    scannerState: extensionScannerState,
    settings: extensionSettings,
    state: extensionState,
  };

  contactServer("sync-server", data);
}

async function onLaunch() {
  console.log("Launch");
  let extensionState = (await chrome.storage.local.get("extension-state"))["extension-state"];
  let extensionSettings = (await chrome.storage.local.get("extension-settings"))["extension-settings"];
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  let actions = {
    "instance-create": async () => {
      let extensionScannerState = (await chrome.storage.local.get("extension-scanner-state"))["extension-scanner-state"];
      let extensionSettings = (await chrome.storage.local.get("extension-settings"))["extension-settings"];
      let extensionState = (await chrome.storage.local.get("extension-state"))["extension-state"];

      if (message.payload.token == "") {
        await contactServer("instance-create", {
          generateToken: true,
          scannerState: extensionScannerState,
          settings: extensionSettings,
          state: extensionState,
        });
        console.log(response);
      } else {
        await contactServer("instance-create", {
          generateToken: false,
          token: message.payload.token,
          scannerState: extensionScannerState,
          settings: extensionSettings,
          state: extensionState,
        });
      }

      sendResponse(true);
    },
    "sync-server": async () => {
      syncServer();
      sendResponse(true);
    },
    "spotify-login": async () => {
      let oauth = (await chrome.storage.local.get("extension-oauth"))["extension-oauth"];
      if (oauth.spotify.loggedIn == true) {
        sendResponse({ status: false, message: "Already logged in" });
      }
      let url = getSpotifyEndpoint();
      console.log(url);
      chrome.identity.launchWebAuthFlow(
        {
          url: url,
          interactive: true,
        },
        async function (redirect_url) {
          if (chrome.runtime.lastError) {
            sendResponse({ status: false, message: "Chrome runtime error", error: chrome.runtime.lastError });
          } else {
            if (redirect_url.includes("callback?error=access_denied")) {
              sendResponse({ status: false, message: "Access denied" });
            } else {
              let params = new URLSearchParams("?" + redirect_url.split("?")[1]);
              ACCESS_TOKEN = params.get("code");
              state = params.get("state");

              if (state === spotifySettings.state) {
                response = await contactServer("spotify-token", {
                  code: ACCESS_TOKEN,
                  redirect_uri: spotifySettings.redirectURI,
                });

                //GETTING THE REFRESHTOKEN + TOKEN
                if (response.success == false) {
                  sendResponse({ status: false, message: "Failed to fetch token from code" + response.error });
                  return;
                }
                await chrome.storage.local.set({
                  "extension-oauth": {
                    spotify: {
                      token: response.Token,
                      refreshToken: response.refreshToken,
                      expiry: new Date(new Date().getTime() + 50 * 60 * 1000),
                      loggedIn: true,
                    },
                  },
                });
                sendResponse({ status: true });
              } else {
                sendResponse({ status: false, message: "State not valid" });
              }
            }
          }
        }
      );
    },
    "spotify-refresh": async () => {
      let oauth = (await chrome.storage.local.get("extension-oauth"))["extension-oauth"];
      if (oauth.refreshToken == "") {
        sendResponse({ success: false, message: "No refresh token available" });
      }
      let response = await contactServer("spotify-refresh", {
        refresh_token: oauth.spotify.refreshToken,
      });
    },
  };
  let action = actions[message.key];
  if (!action) {
    console.error("A script called a message without a valid action !");
    console.log(message);
    return true;
  } else {
    action();
    return true;
  }
});

chrome.storage.onChanged.addListener(async (object, areaName) => {});

onLaunch();
