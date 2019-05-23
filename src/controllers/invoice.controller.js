const moment = require('moment');
const {
  Configuration,
  Person,
  Invoice,
  Warehouse,
  Product
} = require('../models');

module.exports = {
  invoice: async (root, { id }) => {
    try {
      const invoice = await Invoice.findById(id).populate('person');

      return invoice;
    } catch (error) {
      console.log(error);
    }
  },
  invoices: async (root, { limit, offset, type }) => {
    try {
      let invoices;
      if (type) {
        invoices = await Invoice.find({ type })
          .populate('user')
          .populate('person', 'name')
          .limit(limit)
          .skip(offset);

        invoices = invoices.map(invoice => ({
          id: invoice.id,
          number: invoice.number,
          amount: invoice.amount,
          dateEmit: invoice.dateEmit,
          status: invoice.status,
          paymentType: invoice.paymentType,
          person: invoice.person.name
        }));
      } else {
        invoices = await Invoice.find({})
          .populate('user')
          .populate('person')
          .limit(limit)
          .skip(offset);
      }

      return invoices;
    } catch (error) {
      console.log(error);
    }
  },
  addInvoice: async (root, { input, type }) => {
    try {
      let config = await Configuration.findOne();
      let warehouse = await Warehouse.findOne();
      if (!config) return 'Debe configurar el sistema antes de usarlo';
      let amount = 0;
      let invoiceNumber;
      let person;
      let { products } = input;

      const { id: personId, ...personInfo } = input.person;

      if (personId) {
        person = await Person.findById(personId);
        if (!person) {
          throw new Error('Persona no encontrada');
        }
      } else {
        person = new Person(personInfo);

        await person.save();
      }

      // Products
      products = products.map(async item => {
        amount += Number(item.price) * Number(item.quantity);
        if (item.product) {
          let product = await Product.findById(item.product);
          if (type === 'VENTA') {
            product.clients.push(person);
            await product.save();
          } else if (type === 'COMPRA') {
            product.suppliders.push(person);
            await product.save();
          }
          return item;
        } else {
          const product = new Product({
            name: item.name,
            price: item.price,
            stock: item.quantity,
            warehouse,
            iva: config.iva.product
          });

          await product.save();

          return {
            product,
            name: product.name,
            price: Number(product.price),
            quantity: Number(item.quantity)
          };
        }
      });

      products = await Promise.all(products);
      // console.log(products);

      // Invoice

      let invoice;

      invoice = new Invoice({
        type,
        dateEmit: moment().format('DD-MM-YYYY'),
        paymentType: input.paymentType,
        note: input.note,
        person,
        products,
        amount
      });
      if (type === 'VENTA') {
        invoice.number = config.invoice.sale.number;
      } else if (type === 'COMPRA') {
        invoice.number = config.invoice.purchase.number;
        invoice.numberRef = input.number;
        invoice.bankRef = input.ref;
      }

      console.log(invoice);

      await invoice.save();

      if (type === 'VENTA') {
        config.invoice.sale.number += 1;
        await config.save();
        person.invoices.sale.push(invoice);
        await person.save();
      } else if (type === 'COMPRA') {
        config.invoice.purchase.number += 1;
        await config.save();
        person.invoices.purchase.push(invoice);
        await person.save();
      }

      return 'Guardado con exito';
    } catch (error) {
      console.log(error);
      return {
        success: false,
        error: true,
        message: 'Error al guardar'
      };
    }
  }
};
