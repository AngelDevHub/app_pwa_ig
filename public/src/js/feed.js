var shareImageButton = document.querySelector("#share-image-button");
var createPostArea = document.querySelector("#create-post");
var closeCreatePostModalButton = document.querySelector(
  "#close-create-post-modal-btn",
);
var sharedMomentsArea = document.querySelector("#shared-moments");

var form = document.querySelector("form");
var titleInput = document.querySelector("#title");
var locationInput = document.querySelector("#location");

function openCreatePostModal() {
  createPostArea.style.transform = "translateY(0)";
  if (typeof deferredPrompt !== "undefined" && deferredPrompt) {
    deferredPrompt.prompt();

    deferredPrompt.userChoice.then(function (choiceResult) {
      console.log(choiceResult.outcome);

      if (choiceResult.outcome === "dismissed") {
        console.log("User cancelled installation");
      } else {
        console.log("User added to home screen");
      }
    });

    deferredPrompt = null;
  }
}

function closeCreatePostModal() {
  createPostArea.style.transform = "translateY(100vh)";
}

if (shareImageButton) {
  shareImageButton.addEventListener("click", openCreatePostModal);
}
if (closeCreatePostModalButton) {
  closeCreatePostModalButton.addEventListener("click", closeCreatePostModal);
}

function createCard(post, prepend) {
  if (!post || (!post.title && !post.location)) return;
  var postId = post.id || post._fbKey;

  // Evitar duplicar tarjetas ya renderizadas
  if (postId && sharedMomentsArea) {
    var existing = sharedMomentsArea.querySelector('[data-post-id="' + postId + '"]');
    if (existing) {
      return;
    }
  }

  var cardWrapper = document.createElement("div");
  cardWrapper.className = "shared-moment-card mdl-card mdl-shadow--2dp";
  if (postId) {
    cardWrapper.setAttribute("data-post-id", postId);
  }

  var cardTitle = document.createElement("div");
  cardTitle.className = "mdl-card__title";
  cardTitle.style.backgroundImage = 'url("/src/images/student_900x300.jpg")';
  cardTitle.style.backgroundSize = "cover";
  cardTitle.style.height = "180px";
  cardWrapper.appendChild(cardTitle);

  var cardTitleTextElement = document.createElement("h2");
  cardTitleTextElement.className = "mdl-card__title-text";
  cardTitleTextElement.textContent = post.title || "Shared moment";
  cardTitle.appendChild(cardTitleTextElement);

  var cardSupportingText = document.createElement("div");
  cardSupportingText.className = "mdl-card__supporting-text";
  cardSupportingText.textContent = post.location || "Location not specified";
  cardSupportingText.style.textAlign = "center";
  cardWrapper.appendChild(cardSupportingText);

  if (window.componentHandler) {
    window.componentHandler.upgradeElement(cardWrapper);
  }

  if (sharedMomentsArea) {
    if (prepend && sharedMomentsArea.firstChild) {
      sharedMomentsArea.insertBefore(cardWrapper, sharedMomentsArea.firstChild);
    } else {
      sharedMomentsArea.appendChild(cardWrapper);
    }
  }
}

function updateUI(posts) {
  clearCards();
  if (!posts || !Array.isArray(posts)) return;
  // Ordenar los posts: el más reciente primero
  posts.sort(function (a, b) {
    var dateA = new Date(a.id || 0).getTime();
    var dateB = new Date(b.id || 0).getTime();
    if (isNaN(dateA)) dateA = 0;
    if (isNaN(dateB)) dateB = 0;
    return dateB - dateA;
  });
  posts.forEach(function (post) {
    createCard(post);
  });
}

function clearCards() {
  while (sharedMomentsArea && sharedMomentsArea.hasChildNodes()) {
    sharedMomentsArea.removeChild(sharedMomentsArea.lastChild);
  }
}

var url = "https://uteq-test-22ef1-default-rtdb.firebaseio.com/post.json";
var networkDataReceived = false;

function fetchPosts() {
  fetch(url)
    .then(function (res) {
      if (!res.ok) {
        throw new Error("Failed to fetch posts: " + res.status);
      }
      return res.json();
    })
    .then(function (data) {
      networkDataReceived = true;
      var dataArray = Object.keys(data || {}).map(function (key) {
        return Object.assign({}, data[key], { id: data[key].id || key, _fbKey: key });
      });
      updateUI(dataArray);

      // Guardar en IndexedDB para disponibilidad offline
      if ("indexedDB" in window && typeof writeData === "function" && typeof clearAllData === "function") {
        clearAllData("posts").then(function () {
          dataArray.forEach(function (p) {
            writeData("posts", p);
          });
        });
      }
    })
    .catch(function (error) {
      console.error("Unable to load posts from the network.", error);
    });
}

// Carga inicial
fetchPosts();

// Carga inicial desde caché local si la red tarda
if ("indexedDB" in window && typeof readData === "function") {
  readData("posts")
    .then(function (data) {
      if (!networkDataReceived && data && data.length > 0) {
        console.log("From cache", data);
        updateUI(data);
      }
    })
    .catch(function (error) {
      console.error("Unable to load cached posts.", error);
    });
}

// Sincronización en tiempo real entre dispositivos (EventSource / SSE de Firebase)
function startRealtimeSync() {
  if ("EventSource" in window) {
    try {
      var source = new EventSource(url);

      source.addEventListener("put", function (event) {
        try {
          var parsed = JSON.parse(event.data);
          if (!parsed) return;
          if (parsed.path === "/") {
            if (parsed.data) {
              var list = Object.keys(parsed.data).map(function (key) {
                return Object.assign({}, parsed.data[key], {
                  id: parsed.data[key].id || key,
                  _fbKey: key,
                });
              });
              updateUI(list);
            }
          } else if (parsed.data && typeof parsed.data === "object") {
            var newPost = Object.assign({}, parsed.data, {
              id: parsed.data.id || parsed.path.replace(/^\//, ""),
              _fbKey: parsed.path.replace(/^\//, ""),
            });
            createCard(newPost, true);
          }
        } catch (e) {
          console.error("Error parsing realtime data", e);
        }
      });

      source.addEventListener("patch", function () {
        fetchPosts();
      });

      source.onerror = function () {
        // EventSource reconecta automáticamente si se interrumpe
      };
    } catch (err) {
      console.error("EventSource failed:", err);
    }
  }

  // Polling automático secundario cada 6 segundos y al enfocar la pestaña
  setInterval(function () {
    if (document.visibilityState === "visible") {
      fetchPosts();
    }
  }, 6000);

  window.addEventListener("focus", function () {
    fetchPosts();
  });
}

startRealtimeSync();

// Escuchar mensajes del Service Worker cuando termine de sincronizar en segundo plano
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", function (event) {
    if (event.data && event.data.action === "update-posts") {
      fetchPosts();
    }
  });
}

function sendData(post) {
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(post),
  })
    .then(function (res) {
      console.log("Sent data", res);
      var snackbarContainer = document.querySelector("#confirmation-toast");
      if (snackbarContainer && snackbarContainer.MaterialSnackbar) {
        snackbarContainer.MaterialSnackbar.showSnackbar({
          message: "¡Publicación enviada con éxito!",
        });
      }
      fetchPosts();
    })
    .catch(function (err) {
      console.error("Error sending post:", err);
    });
}

if (form) {
  form.addEventListener("submit", function (event) {
    event.preventDefault();

    if (titleInput.value.trim() === "" || locationInput.value.trim() === "") {
      alert("Please enter valid data!");
      return;
    }

    var title = titleInput.value.trim();
    var location = locationInput.value.trim();
    var newPost = {
      id: new Date().toISOString(),
      title: title,
      location: location,
      image: "/src/images/student_900x300.jpg",
    };

    // 1. Mostrar de inmediato en pantalla (Optimistic UI) sin esperar ni refrescar
    createCard(newPost, true);

    // 2. Limpiar y cerrar formulario
    titleInput.value = "";
    locationInput.value = "";
    if (titleInput.parentElement && titleInput.parentElement.MaterialTextfield) {
      titleInput.parentElement.MaterialTextfield.change("");
    }
    if (locationInput.parentElement && locationInput.parentElement.MaterialTextfield) {
      locationInput.parentElement.MaterialTextfield.change("");
    }
    closeCreatePostModal();

    // 3. Sincronizar con Firebase / Background Sync
    if ("serviceWorker" in navigator && "SyncManager" in window) {
      navigator.serviceWorker.ready.then(function (sw) {
        writeData("sync-posts", newPost)
          .then(function () {
            return sw.sync.register("sync-new-posts");
          })
          .then(function () {
            var snackbarContainer = document.querySelector("#confirmation-toast");
            if (snackbarContainer && snackbarContainer.MaterialSnackbar) {
              snackbarContainer.MaterialSnackbar.showSnackbar({
                message: "¡Tu publicación fue guardada y se está sincronizando!",
              });
            }
          })
          .catch(function (err) {
            console.log(err);
            sendData(newPost);
          });
      });
    } else {
      sendData(newPost);
    }
  });
}
