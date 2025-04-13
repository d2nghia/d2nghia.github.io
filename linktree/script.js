document.addEventListener('DOMContentLoaded', () => {
    const topCircle = document.querySelector('.circle-top');
    const bottomCircle = document.querySelector('.circle-bottom');
    let rotation = 0;
    
    function animate() {
        rotation += 0.5;
        topCircle.style.transform = `translateX(-50%) rotate(${rotation}deg)`;
        bottomCircle.style.transform = `translateX(-50%) rotate(${180 + rotation}deg)`;
        requestAnimationFrame(animate);
    }
    
    animate();
}); 