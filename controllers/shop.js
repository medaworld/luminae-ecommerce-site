const Product = require('../models/product');
const Order = require('../models/order');
const User = require('../models/user');
const BestSeller = require('../models/best-seller');
const ProductCategory = require('../models/product-category');

const stripe = require('stripe');

const { capitalizeEveryWord } = require('../helpers/helpers');

exports.getHome = async (req, res, next) => {
  try {
    const bestSellers = await BestSeller.find()
      .populate('productId')
      .sort({ order: 1 });

    res.render('shop/home', {
      pageTitle: null,
      path: '/',
      bestSellers,
      user: req.user,
      isAuthenticated: req.session.isLoggedIn,
      isAdmin: req.session.isAdmin
    });
  } catch (err) {
    next(err);
  }
};

// SHOP

exports.getProducts = async (req, res, next) => {
  const page = +req.query.page || 1;
  const ITEMS_PER_PAGE = 10;
  try {
    const categories = await ProductCategory.find();

    const totalItems = await Product.find().countDocuments();

    const products = await Product.find()
      .skip((page - 1) * ITEMS_PER_PAGE)
      .limit(ITEMS_PER_PAGE);

    if (ITEMS_PER_PAGE * (page - 1) > totalItems) {
      return res.redirect('/shop-all');
    }

    res.render('shop/shop', {
      pageTitle: 'Shop All',
      path: '/shop-all',
      products,
      categories,
      user: req.user,
      isAuthenticated: req.session.isLoggedIn,
      isAdmin: req.session.isAdmin,
      currentPage: page,
      hasNextPage: ITEMS_PER_PAGE * page < totalItems,
      hasPreviousPage: page > 1,
      nextPage: page + 1,
      previousPage: page - 1,
      lastPage: Math.ceil(totalItems / ITEMS_PER_PAGE)
    });
  } catch (err) {
    next(err);
  }
};

exports.getProduct = (req, res, next) => {
  const prodId = req.params.productId;
  Product.findById(prodId)
    .then((product) => {
      res.render('shop/product-detail', {
        pageTitle: product.title,
        path: '/shop/' + prodId,
        product: product,
        user: req.user,
        isAuthenticated: req.session.isLoggedIn,
        isAdmin: req.session.isAdmin
      });
    })
    .catch((err) => {
      next(err);
    });
};

exports.getCategory = async (req, res, next) => {
  const page = +req.query.page || 1;
  const ITEMS_PER_PAGE = 10;
  let totalItems;

  let catTitle = req.params.categoryTitle;

  try {
    const categories = await ProductCategory.find();
    let products;

    if (catTitle === 'best-sellers') {
      totalItems = await BestSeller.find().countDocuments();

      const bestSellers = await BestSeller.find()
        .populate('productId')
        .sort({ order: 1 })
        .skip((page - 1) * ITEMS_PER_PAGE)
        .limit(ITEMS_PER_PAGE);

      products = bestSellers.map((product) => {
        return product.productId;
      });
      catTitle = 'Best Sellers';
    } else {
      totalItems = await ProductCategory.findOne({
        title: { $regex: catTitle, $options: 'i' }
      }).countDocuments();

      const categoryProducts = await ProductCategory.findOne({
        title: { $regex: catTitle, $options: 'i' }
      })
        .populate('products.productId')
        .skip((page - 1) * ITEMS_PER_PAGE)
        .limit(ITEMS_PER_PAGE);

      products = categoryProducts.products.map((product) => {
        return product.productId;
      });
    }

    if (ITEMS_PER_PAGE * (page - 1) > totalItems) {
      return res.redirect('/shop-all');
    }

    res.render('shop/shop', {
      pageTitle: capitalizeEveryWord(catTitle),
      path: '/shop/category/' + catTitle,
      products,
      categories,
      user: req.user,
      isAuthenticated: req.session.isLoggedIn,
      isAdmin: req.session.isAdmin,
      totalProducts: totalItems,
      currentPage: page,
      hasNextPage: ITEMS_PER_PAGE * page < totalItems,
      hasPreviousPage: page > 1,
      nextPage: page + 1,
      previousPage: page - 1,
      lastPage: Math.ceil(totalItems / ITEMS_PER_PAGE)
    });
  } catch (err) {
    next(err);
  }
};

// CART

exports.getCart = async (req, res, next) => {
  try {
    let totalPrice = 0;
    let totalQty = 0;
    let products;

    if (req.user instanceof User) {
      const user = await req.user.populate('cart.items.productId');

      products = user.cart.items;
    } else {
      const cartItems = req.session.temporaryCart.items;
      const prodIds = cartItems.map((item) => item.productId);

      const prods = await Product.find({ _id: { $in: prodIds } });

      products = cartItems.map((item, index) => ({
        productId: prods[index],
        quantity: item.quantity
      }));
    }
    products.forEach((p) => {
      totalPrice += p.productId.price * p.quantity;
      totalQty += p.quantity;
    });

    res.render('shop/cart', {
      path: '/cart',
      pageTitle: 'Your Cart',
      products: products,
      totalPrice: totalPrice,
      totalQty: totalQty,
      user: req.user,
      isAuthenticated: req.session.isLoggedIn,
      isAdmin: req.session.isAdmin
    });
  } catch (err) {
    next(err);
  }
};

exports.postCart = async (req, res, next) => {
  try {
    const prodId = req.body.productId;
    const product = await Product.findById(prodId);

    if (req.user instanceof User) {
      await req.user.addToCart(product);
    } else {
      // Guest User postCart
      if (!req.session.temporaryCart) {
        req.session.temporaryCart = { items: [] };
      }

      const cartProductIndex = req.session.temporaryCart.items.findIndex(
        (item) => {
          return item.productId.toString() === prodId;
        }
      );

      if (cartProductIndex !== -1) {
        req.session.temporaryCart.items[cartProductIndex].quantity += 1;
      } else {
        req.session.temporaryCart.items.push({
          productId: prodId,
          quantity: 1
        });
      }
    }

    res.redirect('/cart');
  } catch (err) {
    next(err);
  }
};

exports.postCartDeleteProduct = async (req, res, next) => {
  try {
    const prodId = req.body.productId;
    if (req.user instanceof User) {
      await req.user.removeFromCart(prodId);
    } else {
      // Guest User deleteProduct
      req.session.temporaryCart.items = req.session.temporaryCart.items.filter(
        (item) => item.productId !== prodId
      );
    }
    res.redirect('/cart');
  } catch (err) {
    next(err);
  }
};

exports.postCartUpdateProduct = async (req, res, next) => {
  const prodId = req.body.productId;
  const qty = parseInt(req.body.qty);

  if (isNaN(qty) || qty <= 0) {
    if (req.user instanceof User) {
      await req.user.removeFromCart(prodId);
    } else {
      req.session.temporaryCart.items = req.session.temporaryCart.items.filter(
        (item) => item.productId !== prodId
      );
    }
    return res.redirect('/cart');
  }

  try {
    if (req.user instanceof User) {
      await req.user.updateCart(prodId, qty);
    } else {
      // Guest User updateProduct
      const temporaryCart = req.session.temporaryCart || { items: [] };
      const existingItem = temporaryCart.items.find(
        (item) => item.productId === prodId
      );

      if (existingItem) {
        existingItem.quantity = qty;
      } else {
        temporaryCart.items.push({ productId: prodId, quantity: qty });
      }

      req.session.temporaryCart = temporaryCart;
    }

    console.log('Updated quantity!');
    res.redirect('/cart');
  } catch (err) {
    next(err);
  }
};

exports.getCheckout = async (req, res, next) => {
  try {
    let user;
    let products;
    let total = 0;
    let totalQty = 0;

    if (req.user instanceof User) {
      user = await req.user.populate('cart.items.productId');
      products = user.cart.items;
    } else {
      // Guest User Checkout
      const cartItems = req.session.temporaryCart.items;
      const prodIds = cartItems.map((item) => item.productId);

      const prods = await Product.find({ _id: { $in: prodIds } });

      products = cartItems.map((item, index) => ({
        productId: prods[index],
        quantity: item.quantity
      }));
    }

    const lineItems = products.map((p) => {
      const unitAmount = parseInt(p.productId.price).toFixed(2) * 100;
      total += p.productId.price * p.quantity;
      totalQty += p.quantity;
      return {
        price_data: {
          tax_behavior: 'exclusive',
          currency: 'usd',
          unit_amount: unitAmount,
          product_data: {
            name: p.productId.title,
            description: p.productId.description
          }
        },
        quantity: p.quantity
      };
    });

    const isFreeShippingEligible = total > 50;

    const shippingOptions = [
      {
        shipping_rate_data: {
          tax_behavior: 'exclusive',
          type: 'fixed_amount',
          fixed_amount: {
            amount: isFreeShippingEligible ? 0 : 1000,
            currency: 'usd'
          },
          display_name: isFreeShippingEligible
            ? 'Free Shipping (over $50)'
            : '$10 Shipping',
          delivery_estimate: {
            minimum: {
              unit: 'business_day',
              value: 5
            },
            maximum: {
              unit: 'business_day',
              value: 7
            }
          }
        }
      }
    ];

    const session = await stripe(req.stripeSk).checkout.sessions.create({
      payment_method_types: ['card'],
      shipping_address_collection: {
        allowed_countries: ['US', 'CA']
      },
      shipping_options: shippingOptions,
      line_items: lineItems,
      automatic_tax: {
        enabled: true
      },
      mode: 'payment',
      success_url: `${req.protocol}://${req.get('host')}/checkout/success`,
      cancel_url: `${req.protocol}://${req.get('host')}/checkout/cancel`
    });

    res.render('shop/checkout', {
      path: '/checkout',
      pageTitle: 'Checkout',
      products: products,
      totalPrice: total,
      totalQty: totalQty,
      stripe: req.stripePk,
      sessionId: session.id,
      user: req.user || null,
      isAuthenticated: req.session.isLoggedIn || true,
      isAdmin: req.session.isAdmin || false
    });
  } catch (err) {
    next(err);
  }
};

exports.getCheckoutSuccess = async (req, res, next) => {
  try {
    let user;
    let products;
    if (req.user instanceof User) {
      user = await req.user.populate('cart.items.productId');
      products = user.cart.items.map((item) => ({
        quantity: item.quantity,
        product: { ...item.productId._doc }
      }));
    } else {
      const cartItems = req.session.temporaryCart.items;
      const prodIds = cartItems.map((item) => item.productId);
      const prods = await Product.find({ _id: { $in: prodIds } });
      products = cartItems.map((item, index) => ({
        quantity: item.quantity,
        product: prods[index]
      }));
    }

    if (!products.length) {
      return res.redirect('/cart');
    }

    const userEmail = user ? req.user.email : 'Guest';
    const userId = user ? req.user._id : '000000000000000000000000';

    const subtotal = products.reduce((total, p) => {
      return total + parseFloat(p.product.price) * p.quantity;
    }, 0);

    const tax = parseFloat((subtotal * 0.09375).toFixed(2));
    const shipping = parseFloat(subtotal > 50 ? 0 : 10);
    const total = parseFloat(subtotal + tax + shipping);

    const order = new Order({
      user: {
        email: userEmail,
        userId: userId
      },
      products,
      createdAt: new Date(),
      totalDetails: {
        subtotal,
        tax,
        shipping,
        total
      }
    });

    await order.save();

    const orderId = order._id;

    if (user) {
      await req.user.clearCart();
      res.redirect(`/user/${req.user._id}/orders`);
    } else {
      req.session.temporaryCart.items = [];
      res.render('shop/thank-you', {
        pageTitle: 'Thank You',
        path: '/shop/thank-you',
        user: req.user || null,
        isAuthenticated: req.session.isLoggedIn || false,
        isAdmin: req.session.isAdmin || false,
        orderId
      });
    }
  } catch (err) {
    const error = new Error(err);
    error.httpStatusCode = 500;
    return next(error);
  }
};

exports.getCheckoutCancel = (req, res, next) => {
  res.redirect('/checkout');
};
