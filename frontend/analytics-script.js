//script.js

// ==================== AUTH CHECK ====================
const token = sessionStorage.getItem("token");

// Redirect to login if no token
if (!token) {
  window.location.href = "/login.html";
}

// ==================== API HELPER ====================
async function fetchAPI(endpoint, options = {}) {
  const defaultOptions = {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  };

  const response = await fetch(
    `http://${window.location.hostname}:3000${endpoint}`,
    {
      ...defaultOptions,
      ...options,
      headers: { ...defaultOptions.headers, ...options.headers },
    }
  );

  if (response.status === 401) {
    // Token expired or invalid
    sessionStorage.removeItem("token");
    window.location.href = "/login.html";
    return;
  }

  return response.json();
}

// ==================== LOAD USER DATA ====================
async function loadUserData() {
  try {
    const user = await fetchAPI("/api/users/me");

    // Update sidebar with user info
    const displayName = user.displayName || user.username;
    document.querySelector(".account-info h3").textContent = displayName;
    document.querySelector(".account-info p").textContent = `@${user.username}`;

    // Update avatar if available
    const avatarElement = document.querySelector(".account-avatar");
    if (user.avatarUrl && user.avatarUrl.trim() !== "") {
      avatarElement.innerHTML = `<img src="${user.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" alt="Avatar">`;
    } else {
      avatarElement.innerHTML = "👤";
    }

    console.log("User loaded:", user);
  } catch (error) {
    console.error("Error loading user:", error);
  }
}

// ==================== LOAD FEED ====================
async function loadFeed() {
  try {
    const posts = await fetchAPI("/api/posts/feed");

    const feedContainer = document.querySelector("#feed-view");
    const storiesSection = feedContainer.querySelector(".stories");

    // Clear existing posts (keep stories)
    const existingPosts = feedContainer.querySelectorAll(".post");
    existingPosts.forEach((post) => post.remove());

    // Add posts after stories
    posts.forEach((post) => {
      const postElement = createPostElement(post);
      feedContainer.appendChild(postElement);
    });

    console.log("Feed loaded:", posts);
  } catch (error) {
    console.error("Error loading feed:", error);
  }
}

// ==================== CREATE POST ELEMENT ====================
function createPostElement(post) {
  const div = document.createElement("div");
  div.className = "post";
  div.innerHTML = `
        <div class="post-header">
            <div class="post-author">
                <div class="post-avatar-small">${post.avatar || "👤"}</div>
                <div class="author-info">
                    <h4>${post.displayName || post.username}</h4>
                    <p>@${post.username} • ${post.timestamp || "Just now"}</p>
                </div>
            </div>
            <button class="post-menu">⋯</button>
        </div>
        <div class="post-text">${post.content}</div>
        ${
          post.mediaUrl
            ? `<img src="${post.mediaUrl}" style="width:100%;border-radius:8px;margin:10px 0;">`
            : ""
        }
        <div class="post-buttons">
            <button class="post-btn" onclick="likePost('${post.id}')">🤍 Like ${
    post.likes > 0 ? `(${post.likes})` : ""
  }</button>
            <button class="post-btn">💬 Comment ${
              post.comments > 0 ? `(${post.comments})` : ""
            }</button>
            <button class="post-btn">↗️ Share</button>
        </div>
    `;
  return div;
}

// ==================== POST ACTIONS ====================
async function likePost(postId) {
  try {
    // Implement like functionality
    console.log("Liked post:", postId);
  } catch (error) {
    console.error("Error liking post:", error);
  }
}

// ==================== TOGGLE VIEWS ====================
function showFeed() {
  document.getElementById("feed-view").classList.add("active");
  document.getElementById("messages-view").classList.remove("active");
  document.querySelectorAll(".toggle-btn")[0].classList.add("active");
  document.querySelectorAll(".toggle-btn")[1].classList.remove("active");
}

function showMessages() {
  document.getElementById("feed-view").classList.remove("active");
  document.getElementById("messages-view").classList.add("active");
  document.querySelectorAll(".toggle-btn")[0].classList.remove("active");
  document.querySelectorAll(".toggle-btn")[1].classList.add("active");
}

// ==================== POST MODAL ====================
function showPostModal() {
  document.getElementById("postModal").classList.add("active");
}

function closePostModal() {
  document.getElementById("postModal").classList.remove("active");
}

function selectPostType(type) {
  const buttons = document.querySelectorAll(".type-btn");
  buttons.forEach((btn) => btn.classList.remove("active"));
  event.target.classList.add("active");

  document.getElementById("textForm").classList.remove("active");
  document.getElementById("fileForm").classList.remove("active");

  if (type === "text") {
    document.getElementById("textForm").classList.add("active");
  } else {
    document.getElementById("fileForm").classList.add("active");
  }
}

// Close modal when clicking outside
const postModal = document.getElementById("postModal");
if (postModal) {
  postModal.addEventListener("click", function (e) {
    if (e.target === this) {
      closePostModal();
    }
  });
}

// ==================== CREATE POST ====================
const btnPost = document.querySelector(".btn-post");
if (btnPost) {
  btnPost.addEventListener("click", async function () {
    try {
      const textForm = document.getElementById("textForm");
      const fileForm = document.getElementById("fileForm");

      let postData = {};

      if (textForm.classList.contains("active")) {
        const content = textForm.querySelector("textarea").value.trim();
        if (!content) {
          alert("Please enter some text");
          return;
        }
        postData = { content, type: "text" };
      } else {
        const fileInput = fileForm.querySelector('input[type="file"]');
        const caption = fileForm
          .querySelector('input[type="text"]')
          .value.trim();

        if (!fileInput.files[0]) {
          alert("Please select a file");
          return;
        }

        postData = { content: caption || "Shared a file", type: "file" };
      }

      const response = await fetchAPI("/api/posts", {
        method: "POST",
        body: JSON.stringify(postData),
      });

      console.log("Post created:", response);

      textForm.querySelector("textarea").value = "";
      fileForm.querySelector('input[type="text"]').value = "";
      fileForm.querySelector('input[type="file"]').value = "";
      closePostModal();

      await loadFeed();
    } catch (error) {
      console.error("Error creating post:", error);
      alert("Failed to create post");
    }
  });
}

// ==================== LOGOUT ====================
const logoutBtn = document.querySelector(".logout-btn");
  if (logoutBtn) {
  logoutBtn.addEventListener("click", function () {
    sessionStorage.removeItem("token");
    window.location.href = "/login.html";
  });
}

// ==================== ANALYTICS FUNCTIONS ====================
// Add these to your existing script.js

let mode = "day"; // default analytics mode
let likesChart, sentimentChart;

// ==================== CHANGE ANALYTICS MODE ====================
function changeMode(selected) {
  mode = selected;
  document
    .querySelectorAll(".toggle-btn")
    .forEach((btn) => btn.classList.remove("active"));
  document
    .querySelector(`[onclick="changeMode('${selected}')"]`)
    .classList.add("active");
  loadCharts();
}

// ==================== LOAD ANALYTICS CHARTS ====================
async function loadCharts() {
  try {
    console.log("Fetching analytics for mode:", mode);

    // Fetch data from backend using existing fetchAPI helper
    const result = await fetchAPI(`/api/analytics/${mode}`);

    console.log("Analytics data received:", result);

    if (!result.ok || !result.data) {
      throw new Error("Invalid data format from server");
    }

    const data = result.data;

    // Get canvas contexts
    const likesCtx = document.getElementById("likesChart");
    const sentimentCtx = document.getElementById("sentimentChart");

    if (!likesCtx || !sentimentCtx) {
      console.error("Chart canvases not found");
      return;
    }

    // Destroy existing charts
    if (likesChart) likesChart.destroy();
    if (sentimentChart) sentimentChart.destroy();

    // Create Likes Bar Chart
    likesChart = new Chart(likesCtx, {
      type: "bar",
      data: {
        labels: data.labels,
        datasets: [
          {
            label: "Total Likes",
            data: data.likes,
            backgroundColor: "rgba(102, 126, 234, 0.8)",
            borderColor: "rgba(102, 126, 234, 1)",
            borderWidth: 2,
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              color: "#ccc",
              stepSize: 1,
            },
            grid: {
              color: "#2c2e38",
            },
          },
          x: {
            ticks: {
              color: "#ccc",
            },
            grid: {
              color: "#2c2e38",
            },
          },
        },
        plugins: {
          legend: {
            labels: {
              color: "#ccc",
            },
          },
        },
      },
    });

    // Create Sentiment Pie Chart
    sentimentChart = new Chart(sentimentCtx, {
      type: "pie",
      data: {
        labels: ["Positive", "Negative", "Neutral"],
        datasets: [
          {
            data: [
              data.sentiment.positive,
              data.sentiment.negative,
              data.sentiment.neutral,
            ],
            backgroundColor: [
              "rgba(74, 222, 128, 0.8)",
              "rgba(248, 113, 113, 0.8)",
              "rgba(148, 163, 184, 0.8)",
            ],
            borderColor: [
              "rgba(74, 222, 128, 1)",
              "rgba(248, 113, 113, 1)",
              "rgba(148, 163, 184, 1)",
            ],
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: "#ccc",
              padding: 15,
            },
          },
        },
      },
    });

    // Update info cards
    const topPostElement = document.getElementById("topPostText");
    const trendingTagElement = document.getElementById("trendingTagText");

    if (topPostElement) {
      topPostElement.innerText = `${data.topPost.text.substring(0, 100)}${
        data.topPost.text.length > 100 ? "..." : ""
      } — ${data.topPost.likes} Likes`;
    }

    if (trendingTagElement) {
      trendingTagElement.innerText = `${data.trendingHashtag.tag} (${
        data.trendingHashtag.count
      } ${data.trendingHashtag.count === 1 ? "post" : "posts"})`;
    }

    console.log("✅ Analytics loaded successfully");
  } catch (error) {
    console.error("❌ Error loading analytics:", error);

    const topPostElement = document.getElementById("topPostText");
    const trendingTagElement = document.getElementById("trendingTagText");

    if (topPostElement) topPostElement.innerText = "Failed to load data";
    if (trendingTagElement)
      trendingTagElement.innerText = "Check console for errors";

    alert(`Failed to load analytics: ${error.message}`);
  }
}

// ==================== INITIALIZE ANALYTICS PAGE ====================
// This function should be called only on the analytics page
async function initializeAnalytics() {
  await loadUserData();
  await loadCharts();
}

// ==================== PAGE-SPECIFIC INITIALIZATION ====================
// Modify your existing DOMContentLoaded to detect which page we're on
document.addEventListener("DOMContentLoaded", async function () {
  // Check if we're on the analytics page
  const isAnalyticsPage = document.getElementById("likesChart") !== null;

  if (isAnalyticsPage) {
    // Analytics page
    await initializeAnalytics();
  } else {
    // Home page
    await loadUserData();
    await loadFeed();
  }
});
