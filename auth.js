// SIGNUP FUNCTION
function signup() {
    const username = document.getElementById("signupUsername").value;
    const password = document.getElementById("signupPassword").value;

    if (username === "" || password === "") {
        alert("Please fill all fields");
        return;
    }

    // Save user data
    localStorage.setItem("username", username);
    localStorage.setItem("password", password);

    alert("Signup successful! Please login.");

    // Redirect to login page (NOT index)
    window.location.href = "login.html";
}


// LOGIN FUNCTION
function login() {
    const username = document.getElementById("loginUsername").value;
    const password = document.getElementById("loginPassword").value;

    const storedUsername = localStorage.getItem("username");
    const storedPassword = localStorage.getItem("password");

    if (username === storedUsername && password === storedPassword) {
        localStorage.setItem("loggedIn", "true");
        alert("Login successful!");
        window.location.href = "index.html";
    } else {
        alert("Invalid username or password");
    }
}


// LOGOUT FUNCTION
function logout() {
    localStorage.setItem("loggedIn", "false");
    window.location.href = "login.html";
}


// CHECK LOGIN STATUS (Protect index.html)
if (window.location.pathname.includes("index.html")) {
    const isLoggedIn = localStorage.getItem("loggedIn");
    if (isLoggedIn !== "true") {
        window.location.href = "login.html";
    }
}