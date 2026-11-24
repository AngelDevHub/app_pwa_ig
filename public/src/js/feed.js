var shareImageButton = document.querySelector("#share-image-button");
var createPostArea = document.querySelector("#create-post");
var closeCreatePostModalButton = document.querySelector(
  "#close-create-post-modal-btn",
);
var sharedMomentsArea = document.querySelector("#shared-moments");

var form = document.querySelector("form");
var titleInput = document.querySelector("#title");
var locationInput = document.querySelector("#location");

function showToast(message) {
  var snackbarContainer = document.querySelector("#confirmation-toast");
  if (snackbarContainer && snackbarContainer.MaterialSnackbar) {
    snackbarContainer.MaterialSnackbar.showSnackbar({
      message: message,
      timeout: 3500,
    });
  } else {
    console.log("[Toast]", message);
  }
}

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
  var locText = post.location || "Location not specified";
  cardSupportingText.textContent = locText;
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
  if (!navigator.onLine) {
    // Si estamos sin conexión, no hacer fetch a la red, cargar de IndexedDB
    loadCachedPosts();
    return;
  }

  fetch(url)
    .then(function (res) {
      if (!res.ok) {
        throw new Error("Failed to fetch posts: " + res.status);
      }
      return res.json();
    })
    .then(function (data) {
      networkDataReceived = true;
      console.log("From web", data);
      var dataArray = Object.keys(data || {}).map(function (key) {
        return Object.assign({}, data[key], { id: data[key].id || key, _fbKey: key });
      });

      // Incluir también los posts locales que estén pendientes de envío en sync-posts
      if ("indexedDB" in window && typeof readAllData === "function") {
        readAllData("sync-posts").then(function (pending) {
          if (pending && pending.length > 0) {
            var pendingFormatted = pending.map(function (p) {
              return Object.assign({}, p, { isOfflinePending: true });
            });
            updateUI(pendingFormatted.concat(dataArray));
          } else {
            updateUI(dataArray);
          }
        });
      } else {
        updateUI(dataArray);
      }

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
      console.error("Unable to load posts from the network, falling back to cache.", error);
      loadCachedPosts();
    });
}

function loadCachedPosts() {
  if ("indexedDB" in window && typeof readAllData === "function") {
    Promise.all([readAllData("posts"), readAllData("sync-posts")])
      .then(function (results) {
        var posts = results[0] || [];
        var pending = (results[1] || []).map(function (p) {
          return Object.assign({}, p, { isOfflinePending: true });
        });
        var all = pending.concat(posts);
        if (all.length > 0) {
          console.log("Cargados de IndexedDB (offline):", all);
          updateUI(all);
        }
      })
      .catch(function (err) {
        console.error("Error loading cached posts:", err);
      });
  }
}

// Carga inicial
fetchPosts();
loadCachedPosts();

// -------------------------------------------------------------
// SINCRONIZACIÓN DE PUBLICACIONES PENDIENTES (OFFLINE -> ONLINE)
// Funciona en iPhone (iOS Safari), Android y PC sin depender de SyncManager
// -------------------------------------------------------------
var isSyncingPending = false;

function syncPendingPosts() {
  if (!navigator.onLine || isSyncingPending) {
    return Promise.resolve();
  }

  if (!("indexedDB" in window) || typeof readAllData !== "function") {
    return Promise.resolve();
  }

  isSyncingPending = true;

  return readAllData("sync-posts")
    .then(function (pendingList) {
      if (!pendingList || pendingList.length === 0) {
        isSyncingPending = false;
        return;
      }

      console.log("[Offline-Sync] Publicaciones pendientes encontradas:", pendingList.length);

      var chain = Promise.resolve();

      pendingList.forEach(function (dt) {
        chain = chain.then(function () {
          return fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              id: dt.id,
              title: dt.title,
              location: dt.location,
              image: dt.image || "/src/images/student_900x300.jpg",
            }),
          })
            .then(function (res) {
              if (res.ok) {
                console.log("[Offline-Sync] Publicación sincronizada:", dt.id);
                return deleteItemFromData("sync-posts", dt.id);
              }
            })
            .catch(function (err) {
              console.error("[Offline-Sync] Error enviando post:", err);
            });
        });
      });

      return chain.then(function () {
        isSyncingPending = false;
        fetchPosts();
      });
    })
    .catch(function (err) {
      isSyncingPending = false;
      console.error("[Offline-Sync] Error general:", err);
    });
}

// 1. Escuchar cuando el internet regrese (evento online del navegador)
window.addEventListener("online", function () {
  console.log("[Red] Conexión a internet reanudada.");
  syncPendingPosts();
  startRealtimeSync();
  fetchPosts();
});

window.addEventListener("offline", function () {
  console.log("[Red] Sin conexión a internet.");
});

// 2. Sincronización en tiempo real entre dispositivos (EventSource / SSE de Firebase)
var realtimeSource = null;

function startRealtimeSync() {
  if (!navigator.onLine) return;
  if (!("EventSource" in window)) return;

  if (realtimeSource) {
    try {
      realtimeSource.close();
    } catch (e) {}
  }

  try {
    realtimeSource = new EventSource(url);

    realtimeSource.addEventListener("put", function (event) {
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

    realtimeSource.addEventListener("patch", function () {
      fetchPosts();
    });

    realtimeSource.onerror = function () {
      // EventSource reconecta automáticamente si se interrumpe
    };
  } catch (err) {
    console.error("EventSource failed:", err);
  }
}

startRealtimeSync();

// Polling de seguridad y comprobación al volver a enfocar la app (ej. desbloquear el móvil)
setInterval(function () {
  if (navigator.onLine) {
    syncPendingPosts();
    if (document.visibilityState === "visible") {
      fetchPosts();
    }
  }
}, 5000);

window.addEventListener("focus", function () {
  if (navigator.onLine) {
    syncPendingPosts();
    fetchPosts();
  }
});

document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "visible" && navigator.onLine) {
    syncPendingPosts();
    fetchPosts();
  }
});

// Escuchar mensajes del Service Worker cuando termine de sincronizar en segundo plano
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", function (event) {
    if (event.data && event.data.action === "update-posts") {
      fetchPosts();
    }
  });
}

// -------------------------------------------------------------
// ENVÍO DE POSTEOS (CON SOPORTE OFFLINE COMPLETO)
// -------------------------------------------------------------
if (form) {
  form.addEventListener("submit", function (event) {
    event.preventDefault();

    if (titleInput.value.trim() === "" || locationInput.value.trim() === "") {
      alert("Por favor ingresa un título y ubicación válidos.");
      return;
    }

    var title = titleInput.value.trim();
    var location = locationInput.value.trim();
    var isOnline = navigator.onLine;

    var newPost = {
      id: new Date().toISOString(),
      title: title,
      location: location,
      image: "/src/images/student_900x300.jpg",
      isOfflinePending: !isOnline,
    };

    // 1. Mostrar de inmediato en pantalla (Optimistic UI) para que el usuario lo vea al instante
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

    // 3. Guardar en IndexedDB 'posts' para que no se pierda al recargar offline
    if ("indexedDB" in window && typeof writeData === "function") {
      writeData("posts", newPost);
    }

    // 4. Si estamos offline o el dispositivo no tiene SyncManager (como iOS / iPhone):
    if (!isOnline) {
      // Guardar en la cola de pendientes
      if ("indexedDB" in window && typeof writeData === "function") {
        writeData("sync-posts", newPost);
      }
      // Si el navegador soporta SyncManager (Android / Chrome Desktop), registrar además el sync
      if ("serviceWorker" in navigator && "SyncManager" in window) {
        navigator.serviceWorker.ready.then(function (sw) {
          sw.sync.register("sync-new-posts");
        });
      }
      return;
    }

    // 5. Si estamos online:
    // Guardar en 'sync-posts' primero y enviar de inmediato
    if ("indexedDB" in window && typeof writeData === "function") {
      writeData("sync-posts", newPost).then(function () {
        // Enviar pendientes
        syncPendingPosts();
      });
    } else {
      // Fallback directo sin IndexedDB
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(newPost),
      })
        .then(function () {
          fetchPosts();
        })
        .catch(function () {});
    }

    // Registrar SyncManager si está disponible
    if ("serviceWorker" in navigator && "SyncManager" in window) {
      navigator.serviceWorker.ready.then(function (sw) {
        sw.sync.register("sync-new-posts");
      });
    }
  });
}
