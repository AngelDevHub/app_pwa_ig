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
  // createPostArea.style.display = 'block';

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
  //createPostArea.style.display = 'none';
  createPostArea.style.transform = "translateY(100vh)";
}

if (shareImageButton) {
  shareImageButton.addEventListener("click", openCreatePostModal);
}
if (closeCreatePostModalButton) {
  closeCreatePostModalButton.addEventListener("click", closeCreatePostModal);
}

function createCard(post) {
  var cardWrapper = document.createElement("div");
  cardWrapper.className = "shared-moment-card mdl-card mdl-shadow--2dp";

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
    sharedMomentsArea.appendChild(cardWrapper);
  }
}

function updateUI(posts) {
  clearCards();
  posts.forEach(function (post) {
    createCard(post || {});
  });
}

function clearCards() {
  while (sharedMomentsArea && sharedMomentsArea.hasChildNodes()) {
    sharedMomentsArea.removeChild(sharedMomentsArea.lastChild);
  }
}

var url = "https://uteq-test-22ef1-default-rtdb.firebaseio.com/post.json";
var networkDataReceived = false;

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
      return Object.assign({}, data[key], { id: key });
    });
    updateUI(dataArray);
  })
  .catch(function (error) {
    console.error("Unable to load posts from the network.", error);
  });

if ("indexedDB" in window) {
  readData("posts")
    .then(function (data) {
      if (!networkDataReceived) {
        console.log("From cache", data);
        updateUI(data);
      }
    })
    .catch(function (error) {
      console.error("Unable to load cached posts.", error);
    });

  function sendData() {
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        id: new Date().toISOString(),
        title: titleInput.value,
        location: locationInput.value,
        image: "../images/student_1600x500.jpg",
      }),
    }).then(function (res) {
      console.log("Sent data", res);
      updateUI();
    });
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    if (titleInput.value.trim() === "" || locationInput.value.trim() === "") {
      alert("Please enter valid data!");
      return;
    }

    closeCreatePostModal();

    if ("serviceWorker" in navigator && "SyncManager" in window) {
      navigator.serviceWorker.ready.then(function (sw) {
        var post = {
          id: new Date().toISOString(),
          title: titleInput.value,
          location: locationInput.value,
        };
        writeData("sync-posts", post)
          .then(function () {
            return sw.sync.register("sync-new-posts");
          })
          .then(function () {
            var snackbarContainer = document.querySelector(
              "#confirmation-toast",
            );
            var data = { message: "Your Post was saved for syncing!" };
            snackbarContainer.MaterialSnackbar.showSnackbar(data);
          })
          .catch(function (err) {
            console.log(err);
          });
      });
    } else {
      sendData();
    }
  });
}
