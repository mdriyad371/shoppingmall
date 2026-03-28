const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============ HEALTH CHECK ============
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============ PAYMENT ACCOUNTS API ============
// Get all payment accounts
app.get('/api/payment-accounts', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('payment_accounts')
            .select('*')
            .order('created_at', { ascending: true });
        
        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Error fetching payment accounts:', error);
        res.status(500).json({ error: error.message });
    }
});

// Add new payment account
app.post('/api/payment-accounts', async (req, res) => {
    try {
        const { name, number, account_holder, is_active } = req.body;
        
        if (!name || !number) {
            return res.status(400).json({ error: 'Name and number are required' });
        }
        
        const { data, error } = await supabase
            .from('payment_accounts')
            .insert([{
                name,
                number,
                account_holder: account_holder || '',
                is_active: is_active !== undefined ? is_active : true
            }])
            .select();
        
        if (error) throw error;
        res.json(data[0]);
    } catch (error) {
        console.error('Error adding payment account:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update payment account
app.put('/api/payment-accounts/:id', async (req, res) => {
    try {
        const { name, number, account_holder, is_active } = req.body;
        const { id } = req.params;
        
        const { data, error } = await supabase
            .from('payment_accounts')
            .update({
                name,
                number,
                account_holder: account_holder || '',
                is_active: is_active !== undefined ? is_active : true,
                updated_at: new Date()
            })
            .eq('id', id)
            .select();
        
        if (error) throw error;
        res.json(data[0]);
    } catch (error) {
        console.error('Error updating payment account:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete payment account
app.delete('/api/payment-accounts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const { error } = await supabase
            .from('payment_accounts')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting payment account:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ PRODUCTS API ============
app.get('/api/products', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        res.json(data);
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
                name, category,
                base_price: basePrice,
                old_price: oldPrice || null,
                stock: stock || 0,
                image,
                rating: rating || 4.0,
                badge: badge || '',
                sizes: sizes || [{ name: "Standard", price: basePrice }]
            }])
            .select();
        
        if (error) throw error;
        res.json(data[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/products/:id', async (req, res) => {
    try {
        const { name, category, basePrice, oldPrice, stock, image, rating, badge, sizes } = req.body;
        
        await supabase.from('products').delete().eq('id', req.params.id);
        
        const { data, error } = await supabase
            .from('products')
            .insert([{
                name, category,
                base_price: basePrice,
                old_price: oldPrice || null,
                stock: stock || 0,
                image,
                rating: rating || 4.0,
                badge: badge || '',
                sizes: sizes || [{ name: "Standard", price: basePrice }],
                created_at: new Date()
            }])
            .select();
        
        if (error) throw error;
        res.json(data[0]);
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
        await supabase.from('wishlists').insert([{ user_id: data[0].id, product_ids: [] }]);
        
        res.json({ id: data[0].id, name: data[0].name, email: data[0].email, role: data[0].role });
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
        
        let { data: cart } = await supabase
            .from('carts')
            .select('items')
            .eq('user_id', data.id)
            .maybeSingle();
        
        if (!cart) {
            const { data: newCart } = await supabase
                .from('carts')
                .insert([{ user_id: data.id, items: [] }])
                .select();
            cart = newCart[0];
        }
        
        let { data: wishlist } = await supabase
            .from('wishlists')
            .select('product_ids')
            .eq('user_id', data.id)
            .maybeSingle();
        
        if (!wishlist) {
            const { data: newWishlist } = await supabase
                .from('wishlists')
                .insert([{ user_id: data.id, product_ids: [] }])
                .select();
            wishlist = newWishlist[0];
        }
        
        res.json({
            user: { id: data.id, name: data.name, email: data.email, role: data.role },
            cart: cart?.items || [],
            wishlist: wishlist?.product_ids || []
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ CART API ============
app.get('/api/cart/:userId', async (req, res) => {
    try {
        let { data, error } = await supabase
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
            res.json([]);
        } else {
            res.json(data.items || []);
        }
    } catch (error) {
        console.error('Cart GET error:', error);
        res.status(500).json({ error: error.message, items: [] });
    }
});

app.put('/api/cart/:userId', async (req, res) => {
    try {
        const { items } = req.body;
        
        const { data: existingCart } = await supabase
            .from('carts')
            .select('id')
            .eq('user_id', req.params.userId)
            .maybeSingle();
        
        if (!existingCart) {
            const { error } = await supabase
                .from('carts')
                .insert([{ user_id: req.params.userId, items: items }]);
            if (error) throw error;
        } else {
            const { error } = await supabase
                .from('carts')
                .update({ items, updated_at: new Date() })
                .eq('user_id', req.params.userId);
            if (error) throw error;
        }
        
        res.json(items);
    } catch (error) {
        console.error('Cart PUT error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ WISHLIST API ============
app.get('/api/wishlist/:userId', async (req, res) => {
    try {
        let { data, error } = await supabase
            .from('wishlists')
            .select('product_ids')
            .eq('user_id', req.params.userId)
            .maybeSingle();
        
        if (error) throw error;
        
        if (!data) {
            const { data: newWishlist, error: insertError } = await supabase
                .from('wishlists')
                .insert([{ user_id: req.params.userId, product_ids: [] }])
                .select();
            
            if (insertError) throw insertError;
            res.json([]);
        } else {
            res.json(data.product_ids || []);
        }
    } catch (error) {
        console.error('Wishlist GET error:', error);
        res.status(500).json({ error: error.message, product_ids: [] });
    }
});

app.put('/api/wishlist/:userId', async (req, res) => {
    try {
        const { productIds } = req.body;
        
        const { data: existingWishlist } = await supabase
            .from('wishlists')
            .select('id')
            .eq('user_id', req.params.userId)
            .maybeSingle();
        
        if (!existingWishlist) {
            const { error } = await supabase
                .from('wishlists')
                .insert([{ user_id: req.params.userId, product_ids: productIds }]);
            if (error) throw error;
        } else {
            const { error } = await supabase
                .from('wishlists')
                .update({ product_ids: productIds, updated_at: new Date() })
                .eq('user_id', req.params.userId);
            if (error) throw error;
        }
        
        res.json(productIds);
    } catch (error) {
        console.error('Wishlist PUT error:', error);
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
        
        res.json({ id: data.id, name: data.name, email: data.email, role: data.role });
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
        const { data: orders } = await supabase.from('orders').select('*');
        const { data: users } = await supabase.from('users').select('id').eq('role', 'user');
        const { data: products } = await supabase.from('products').select('id');
        
        res.json({
            totalOrders: orders?.length || 0,
            pendingOrders: orders?.filter(o => o.order_status === 'pending').length || 0,
            totalRevenue: orders?.reduce((sum, o) => sum + (o.total || 0), 0) || 0,
            totalUsers: users?.length || 0,
            totalProducts: products?.length || 0,
            recentOrders: orders?.slice(0, 5) || []
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = app;
