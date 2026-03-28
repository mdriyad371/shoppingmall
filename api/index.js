const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Middleware
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:5500', 'https://*.vercel.app'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============ HEALTH CHECK ============
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============ PRODUCTS API ============
app.get('/api/products', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        const formattedProducts = data.map(p => ({
            id: p.id,
            name: p.name,
            category: p.category,
            basePrice: p.base_price,
            oldPrice: p.old_price,
            stock: p.stock,
            image: p.image,
            rating: p.rating,
            badge: p.badge,
            sizes: p.sizes || []
        }));
        
        res.json(formattedProducts);
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/products', async (req, res) => {
    try {
        const { name, category, basePrice, oldPrice, stock, image, rating, badge, sizes } = req.body;
        
        if (!name || !category || !basePrice || !image) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const { data, error } = await supabase
            .from('products')
            .insert([{
                name,
                category,
                base_price: basePrice,
                old_price: oldPrice || null,
                stock: stock || 0,
                image,
                rating: rating || 4.0,
                badge: badge || '',
                sizes: sizes || []
            }])
            .select();
        
        if (error) throw error;
        
        res.json({
            id: data[0].id,
            name: data[0].name,
            category: data[0].category,
            basePrice: data[0].base_price,
            oldPrice: data[0].old_price,
            stock: data[0].stock,
            image: data[0].image,
            rating: data[0].rating,
            badge: data[0].badge,
            sizes: data[0].sizes || []
        });
    } catch (error) {
        console.error('Product create error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/products/:id', async (req, res) => {
    try {
        const { name, category, basePrice, oldPrice, stock, image, rating, badge, sizes } = req.body;
        
        const { data, error } = await supabase
            .from('products')
            .update({
                name,
                category,
                base_price: basePrice,
                old_price: oldPrice,
                stock,
                image,
                rating: rating || 4.0,
                badge: badge || '',
                sizes: sizes || []
            })
            .eq('id', req.params.id)
            .select();
        
        if (error) throw error;
        
        res.json({
            id: data[0].id,
            name: data[0].name,
            category: data[0].category,
            basePrice: data[0].base_price,
            oldPrice: data[0].old_price,
            stock: data[0].stock,
            image: data[0].image,
            rating: data[0].rating,
            badge: data[0].badge,
            sizes: data[0].sizes || []
        });
    } catch (error) {
        console.error('Product update error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('products')
            .delete()
            .eq('id', req.params.id);
        
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ USER AUTH API ============
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .maybeSingle();
        
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }
        
        const { data, error } = await supabase
            .from('users')
            .insert([{ name, email, password, role: 'user' }])
            .select();
        
        if (error) throw error;
        
        await supabase.from('carts').insert([{ user_id: data[0].id, items: [] }]);
        
        res.json({ 
            id: data[0].id, 
            name: data[0].name, 
            email: data[0].email,
            role: data[0].role
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .eq('password', password)
            .maybeSingle();
        
        if (error || !data) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const { data: cart } = await supabase
            .from('carts')
            .select('items')
            .eq('user_id', data.id)
            .maybeSingle();
        
        res.json({
            user: {
                id: data.id,
                name: data.name,
                email: data.email,
                role: data.role
            },
            cart: cart?.items || []
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ CART API ============
app.get('/api/cart/:userId', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('carts')
            .select('items')
            .eq('user_id', req.params.userId)
            .maybeSingle();
        
        if (error) throw error;
        
        if (!data) {
            const { data: newCart, error: insertError } = await supabase
                .from('carts')
                .insert([{ user_id: req.params.userId, items: [] }])
                .select();
            
            if (insertError) throw insertError;
            return res.json([]);
        }
        
        const items = Array.isArray(data.items) ? data.items : [];
        res.json(items);
    } catch (error) {
        console.error('Cart GET error:', error);
        res.status(500).json({ error: error.message, items: [] });
    }
});

app.put('/api/cart/:userId', async (req, res) => {
    try {
        const { items } = req.body;
        
        if (!items || !Array.isArray(items)) {
            return res.status(400).json({ error: 'Invalid items data' });
        }
        
        const { data, error } = await supabase
            .from('carts')
            .update({ 
                items: items,
                updated_at: new Date() 
            })
            .eq('user_id', req.params.userId)
            .select();
        
        if (error) {
            const { data: newCart, error: insertError } = await supabase
                .from('carts')
                .insert([{ user_id: req.params.userId, items: items }])
                .select();
            
            if (insertError) throw insertError;
            return res.json(items);
        }
        
        res.json(data?.[0]?.items || items);
    } catch (error) {
        console.error('Cart PUT error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ ORDERS API ============
app.get('/api/orders/:userId', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('user_id', req.params.userId)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/orders', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/orders', async (req, res) => {
    try {
        const { userId, items, customer, total, deliveryCharge, paymentMethod, senderNumber, transactionId } = req.body;
        
        const orderId = 'ORD' + Date.now() + Math.floor(Math.random() * 1000);
        
        const { data, error } = await supabase
            .from('orders')
            .insert([{
                order_id: orderId,
                user_id: userId,
                items,
                customer,
                total,
                delivery_charge: deliveryCharge,
                payment_method: paymentMethod,
                sender_number: senderNumber,
                transaction_id: transactionId,
                payment_status: paymentMethod === 'cod' ? 'pending' : 'pending_verification',
                order_status: 'pending'
            }])
            .select();
        
        if (error) throw error;
        
        await supabase
            .from('carts')
            .update({ items: [] })
            .eq('user_id', userId);
        
        res.json(data[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/orders/:orderId', async (req, res) => {
    try {
        const { orderStatus, paymentStatus, tracking } = req.body;
        
        const { data, error } = await supabase
            .from('orders')
            .update({
                order_status: orderStatus,
                payment_status: paymentStatus,
                tracking
            })
            .eq('order_id', req.params.orderId)
            .select();
        
        if (error) throw error;
        res.json(data[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ ADMIN API ============
app.post('/api/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .eq('password', password)
            .eq('role', 'admin')
            .maybeSingle();
        
        if (error || !data) {
            return res.status(401).json({ error: 'Invalid admin credentials' });
        }
        
        res.json({
            id: data.id,
            name: data.name,
            email: data.email,
            role: data.role
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/users', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('id, name, email, role, created_at')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/stats', async (req, res) => {
    try {
        const { data: orders } = await supabase
            .from('orders')
            .select('*');
        
        const { data: users } = await supabase
            .from('users')
            .select('id')
            .eq('role', 'user');
        
        const { data: products } = await supabase
            .from('products')
            .select('id');
        
        const totalOrders = orders?.length || 0;
        const pendingOrders = orders?.filter(o => o.order_status === 'pending').length || 0;
        const totalRevenue = orders?.reduce((sum, o) => sum + (o.total || 0), 0) || 0;
        const totalUsers = users?.length || 0;
        const totalProducts = products?.length || 0;
        const recentOrders = orders?.slice(0, 5) || [];
        
        res.json({
            totalOrders,
            pendingOrders,
            totalRevenue,
            totalUsers,
            totalProducts,
            recentOrders
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = app;
