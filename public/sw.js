importScripts("/src/js/idb.js");
importScripts("/src/js/utility.js");

var CACHE_STATIC_NAME = "static-v12";
var CACHE_DYNAMIC_NAME = "dynamic-v12";
var STATIC_FILES = [
  "/",
  "/index.html",
  "/offline.html",
  "/favicon.ico",
  "/manifest.json",
  "/src/js/app.js",
  "/src/js/feed.js",
  "/src/js/idb.js",
  "/src/js/utility.js",
  "/src/js/material.min.js",
  "/src/css/app.css",
  "/src/css/feed.css",
  "/src/images/student_900x300.jpg",
  "https://fonts.googleapis.com/css?family=Roboto:400,700",
  "https://fonts.googleapis.com/icon?family=Material+Icons",
  "https://cdnjs.cloudflare.com/ajax/libs/material-design-lite/1.3.0/material.indigo-pink.min.css",
];

self.addEventListener("install", function (event) {
  console.log("[Service Worker] Installing Service Worker ...", event);
  event.waitUntil(
    caches.open(CACHE_STATIC_NAME).then(function (cache) {
      console.log("[Service Worker] Precaching App Shell");
      cache.addAll([
        "/",
        "/index.html",
        "/offline.html",
        "/favicon.ico",
        "/src/js/app.js",
        "/src/js/feed.js",
        "/src/js/idb.js",
        "/src/js/utility.js",
        "/src/js/material.min.js",
        "/src/css/app.css",
        "/src/css/feed.css",
        "/src/images/student_900x300.jpg",
        "https://fonts.googleapis.com/css?family=Roboto:400,700",
        "https://fonts.googleapis.com/icon?family=Material+Icons",
        "https://cdnjs.cloudflare.com/ajax/libs/material-design-lite/1.3.0/material.indigo-pink.min.css",
      ]);
    }),
  );
});
self.addEventListener("activate", function (event) {
  console.log("[Service Worker] Activating Service Worker ....", event);
  event.waitUntil(
    caches.keys().then(function (keyList) {
      return Promise.all(
        keyList.map(function (key) {
          if (key !== CACHE_STATIC_NAME && key !== CACHE_DYNAMIC_NAME) {
            console.log("[Service Worker] Removing old cache.", key);
            return caches.delete(key);
          }
        }),
      );
    }),
  );
  return self.clients.claim();
});

function isInArray(string, array) {
  var cachePath;
  if (string.indexOf(self.origin) === 0) {
    console.log("matched ", string);
    cachePath = string.substring(self.origin.length);
  } else {
    cachePath = string;
  }
  return array.indexOf(cachePath) > -1;
}

self.addEventListener("fetch", function (event) {
  var url = "https://uteq-test-22ef1-default-rtdb.firebaseio.com/post.json";

  if (event.request.url.indexOf(url) > -1) {
    event.respondWith(
      fetch(event.request).then(function (res) {
        if (!res.ok) {
          return res;
        }
        var clonedRes = res.clone();
        return clonedRes
          .json()
          .then(function (data) {
            return clearAllData("posts").then(function () {
              for (var key in data) {
                writeData("posts", data[key]);
              }
            });
          })
          .then(function () {
            return res;
          })
          .catch(function (error) {
            console.error("Unable to cache posts for offline use.", error);
            return res;
          });
      }),
    );
  } else if (isInArray(event.request.url, STATIC_FILES)) {
    event.respondWith(caches.match(event.request));
  } else {
    event.respondWith(
      caches.match(event.request).then(function (response) {
        if (response) {
          return response;
        } else {
          return fetch(event.request)
            .then(function (res) {
              return caches.open(CACHE_DYNAMIC_NAME).then(function (cache) {
                cache.put(event.request.url, res.clone());
                return res;
              });
            })
            .catch(function (err) {
              return caches.open(CACHE_STATIC_NAME).then(function (cache) {
                if (event.request.headers.get("accept").includes("text/html")) {
                  return cache.match("/offline.html");
                }
              });
            });
        }
      }),
    );
  }
});

self.addEventListener("sync", function (event) {
  console.log("[Service Worker] Background syncing", event);
  if (event.tag === "sync-new-posts") {
    console.log("[Service Worker] Syncing new Posts");
    event.waitUntil(
      readAllData("sync-posts").then(function (data) {
        return Promise.all(
          data.map(function (dt) {
            return fetch(
              "https://uteq-test-22ef1-default-rtdb.firebaseio.com/post.json",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
                body: JSON.stringify({
                  id: dt.id,
                  title: dt.title,
                  location: dt.location,
                  image: "../images/student_1600x500.jpg",
                }),
              }
            )
              .then(function (res) {
                console.log("Sent data", res);
                if (res.ok) {
                  return deleteItemFromData("sync-posts", dt.id).then(
                    function () {
                      return self.clients
                        .matchAll({ type: "window" })
                        .then(function (clients) {
                          clients.forEach(function (client) {
                            client.postMessage({ action: "update-posts" });
                          });
                        });
                    },
                  );
                }
              })
              .catch(function (err) {
                console.log("Error while sending data", err);
              });
          })
        );
      })
    );
  }
});
