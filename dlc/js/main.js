const btn = document.getElementById("btn");

document.addEventListener("mousemove", (e) => {
    const rect = btn.getBoundingClientRect();

    const btnX = rect.left + rect.width / 2;
    const btnY = rect.top + rect.height / 2;

    const dx = e.clientX - btnX;
    const dy = e.clientY - btnY;

    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 150) {
        let newX = Math.random() * (window.innerWidth - rect.width);
        let newY = Math.random() * (window.innerHeight - rect.height);

        btn.style.left = newX + "px";
        btn.style.top = newY + "px";
        btn.style.transform = "none";
    }
});
