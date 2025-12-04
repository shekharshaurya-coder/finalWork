// Quick test of the feed endpoint
const token =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2OTI2ODZhMGFhODA3ZDA4MDkyNTBkY2EiLCJ1c2VybmFtZSI6InNhdHZpayIsImlhdCI6MTc2NDE3NjY5NywiZXhwIjoxNzY0NzgxNDk3fQ.GCqCNQGfmB8_3qyZRPKmU_YxfLqZtDT0rVmxJ-Jq-Hs";

fetch("http://localhost:3000/api/posts/feed", {
  headers: {
    Authorization: `Bearer ${token}`,
  },
})
  .then((res) => res.json())
  .then((data) => {
    console.log("Response:", JSON.stringify(data, null, 2));
    console.log("Is array:", Array.isArray(data));
    if (data.posts) {
      console.log("posts property exists, length:", data.posts.length);
      if (data.posts.length > 0) {
        console.log("First post:", JSON.stringify(data.posts[0], null, 2));
      }
    }
  })
  .catch((err) => console.error("Error:", err));
