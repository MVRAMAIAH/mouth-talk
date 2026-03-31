const fs = require('fs');
const path = require('path');

const files = [
    'frontend/index.html',
    'frontend/pages/tolly.html',
    'frontend/pages/hindi.html',
    'frontend/pages/kollywood.html',
    'frontend/pages/mollywood.html',
    'frontend/pages/sandalwood.html',
    'frontend/pages/hollywood.html',
    'frontend/pages/webseries.html',
    'frontend/pages/movie.html'
];

files.forEach(f => {
    try {
        const p = path.resolve(__dirname, f);
        if (!fs.existsSync(p)) return;
        let t = fs.readFileSync(p, 'utf8');
        
        // index.html
        t = t.replace(
            "img.src = m.poster.startsWith('http') ? m.poster : '/assets/images/' + m.poster;",
            "img.src = m.poster.startsWith('http') ? m.poster : '/assets/images/' + (m.poster.includes('.') ? m.poster : m.poster + '.jpg');"
        );
        
        // category pages with template string
        t = t.replace(
            "img.src = m.poster.startsWith('http') ? m.poster : `../assets/images/${m.poster}`;",
            "img.src = m.poster.startsWith('http') ? m.poster : `../assets/images/${m.poster.includes('.') ? m.poster : m.poster + '.jpg'}`;"
        );

        // movie.html
        t = t.replace(
            /src="\$\{movie\.poster\.startsWith\('http'\) \? movie\.poster : '\.\.\/assets\/images\/' \+ movie\.poster\}"/g,
            `src="\${movie.poster.startsWith('http') ? movie.poster : '../assets/images/' + (movie.poster.includes('.') ? movie.poster : movie.poster + '.jpg')}"`
        );
        
        fs.writeFileSync(p, t);
        console.log('Updated', f);
    } catch(err) {
        console.error('Error on', f, err.message);
    }
});
