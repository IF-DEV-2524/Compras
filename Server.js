import express from "express"
import "dotenv/config";
import { PrismaClient } from './prisma/generated/prisma/client.ts'
import { json } from "stream/consumers";
import Decimal from 'decimal.js';



const prisma = new PrismaClient()

export { prisma }

const app = express();

app.use(express.json())
 
// insere produtos
app.post('/product', async (req, res) => {

    try {
        const products = await prisma.product.create({
            data: {
                nm_product: req.body.nm_product,
                gross_amount: req.body.gross_amount,
                fee_amount: req.body.fee_amount,
                shipping: req.body.shipping,
                description: req.body.description
            }
        });

        // Sempre use 201 para criação
        res.status(201).json({
            message: `Novo produto adicionado ao estoque`,
            product: products
        });

        console.log(req)

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao criar produto' });
    }
})

// Adiciona sacola com produtos que devem estar no body
app.post('/bag', async (req, res) => {
    try {

        const products = req.body // captura body para ter acesso aos itens que escolhidos pelo cliente

        if (!Array.isArray(products) || products.length === 0) {
            return res.status(400).json({
                error: 'Lista de produtos inválida'
            })
        }

        // cálculo do total (Soma os valores que estõo na sacola para chegar no valor final do produto)
        const totalGrossAmount = products.reduce(
            (acc, item) => {
                // 1. Garante que os valores são números (usando 0 se forem inválidos)
                const grossAmount = Number(item.gross_amount) || 0;
                const quantity = Number(item.qtd) || 0;

                // 2. Calcula o valor total deste item (Preço Bruto * Quantidade)
                const itemTotal = grossAmount * quantity;

                // 3. Soma o valor total deste item ao acumulador
                return acc + itemTotal;
            },
            0 // Valor inicial (acumulador começa em zero)
        );

        const totalNetAmount = products.reduce(
            (acc, item) => {
                // 1. Converte todos os campos relevantes para número, garantindo 0 se forem inválidos
                const grossAmount = Number(item.gross_amount) || 0;
                const shipping = Number(item.shipping) || 0;
                const feeAmount = Number(item.fee_amount) || 0;
                const quantity = Number(item.qtd) || 0; // Usando 'qtd' para a quantidade

                // 2. Cálculo do valor base (Bruto + Frete)
                const baseAmount = grossAmount + shipping;

                console.log(baseAmount)

                // 3. Cálculo do valor da taxa
                const fee = (feeAmount * baseAmount);

                console.log(fee)
                // 4. Cálculo do valor líquido para UMA UNIDADE
                const netAmountPerUnit = (baseAmount - fee).toFixed(2);

                console.log(netAmountPerUnit)
                console.log(quantity)
                // 5. Cálculo do valor total do ITEM (Valor Líquido por Unidade * Quantidade)
                const totalItemNet = (netAmountPerUnit * quantity);

                console.log(totalItemNet.toFixed(2))
                console.log(totalItemNet)

                // 6. Retorna o acumulador somado ao valor líquido total deste item
                return acc + totalItemNet;
            },
            0 // Valor inicial do acumulador
        );


        console.log(products)

        // criação da sacola
        const bag = await prisma.bag.create({
            data: {
                // Converte o array 'products' em uma string JSON válida.
                // Isso garante que o valor no DB seja legível (ex: "[{"id":"x", "price":10}]")
                items: JSON.stringify(products),

                total_gross_amount: String(totalGrossAmount), // salva o valor total bruto equivalente da sacola
                total_net_amount: String(totalNetAmount) // salva o valor total liquido equivalente da sacola
            }
        })

        return res.status(201).json({
            message: 'Produtos adicionados à sacola com sucesso',
            bag
        })

    } catch (error) {
        console.error(error)
        return res.status(500).json({
            error: 'Erro ao criar sacola'
        })
    }
})

// Busca produtos
app.get('/products', async (req, res) => {

    try {

        const products = await prisma.product.findMany();
        res.status(200).json(products)

    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao consultar produto' });
    }
})

// busca sacolas
app.get('/bags', async (req, res) => {

    try {
        const bags = await prisma.bag.findMany()

        res.status(200).json(bags)
    }
    catch (err) {
        console.log(err)
        res.send("Não foi possível buscar as sacolas")
    }



})

// exclui sacola
app.delete('/bag', async (req, res) => {
    try {
        // Opção 1: Deleta DIRETAMENTE, pois deleteMany({}) é rápido e não falha se não houver registros.
        // A verificação prévia é opcional, mas simplifica o código.

        const bags = await prisma.bag.deleteMany({})

        // A variável 'bags' (resultado de deleteMany) contém a propriedade 'count'
        // que mostra quantos registros foram deletados.

        // Se 0 registros foram afetados, podemos enviar uma mensagem mais informativa.
        if (bags.count === 0) {
            return res.status(200).json({
                message: 'Não havia nenhuma sacola para deletar.',
                deletedCount: 0
            });
        }

        // Enviar a resposta com return após o sucesso.
        return res.status(200).json({
            message: `${bags.count} sacola(s) deletada(s) com sucesso.`,
            deletedCount: bags.count
        })

    } catch (err) { // Variável de erro corrigida para 'err'

        // Referenciar a variável de erro correta ('err')
        console.error(`Erro ao deletar Sacola(s):`, err);

        return res.status(500).json({ // Usar return para garantir que a resposta seja enviada
            message: 'Ocorreu uma falha interna ao deletar a sacola(s).',
            detalhes: err.message // Acessar a mensagem de erro correta
        })
    }
})

// exclui produtos da sacola
app.delete('/bag/:bagId/product/:productId', async (req, res) => {
    try {
        const productId = req.params.productId;
        const bagId = req.params.bagId;

        // 1. Busca a Sacola (Bag)
        let existBag = await prisma.bag.findFirst({
            where: {
                id: bagId
            },
        });

        if (!existBag) {
            return res.status(404).json({ // Use 404 para "Não Encontrado"
                message: "Nenhuma sacola identificada."
            });
        }
        
        console.log("Sacola Encontrada");

        // ***********************************************
        // ATENÇÃO: TRATAMENTO DO CAMPO 'items' (String JSON)
        // ***********************************************
        
        // 2. Desserializa o array de items para poder manipulá-lo
        let items = JSON.parse(existBag.items);

        // 3. Remove o item com o ID correspondente
        const initialLength = items.length;
        
        // Filtra o array para manter apenas os itens cujo ID é diferente do productId
        items = items.filter(item => item.id !== productId);

        // Verifica se algum item foi realmente removido
        if (items.length === initialLength) {
             return res.status(404).json({
                message: `Produto com ID ${productId} não encontrado na sacola.`
            });
        }

        console.log(`Produto ${productId} removido.`);
        
        // 4. Recálculo dos Valores Bruto e Líquido

        let newGrossTotal = new Decimal(0);
        let newNetTotal = new Decimal(0);

        items.forEach(item => {
            // Conversão de valores para Decimal para evitar erros de ponto flutuante
            const grossPrice = new Decimal(item.gross_amount);
            const quantity = new Decimal(item.qtd);
            const shipping = new Decimal(item.shipping);
            const fee = new Decimal(item.fee_amount);

            // Cálculo do total bruto do item: (Preço * Qtd) + Frete
            const itemTotalGross = (grossPrice.times(quantity)).plus(shipping);
            newGrossTotal = newGrossTotal.plus(itemTotalGross);

console.log(itemTotalGross)

console.log(newGrossTotal)

            // Cálculo do total líquido do item: (Total Bruto - Taxa)
            // OBS: Esta é uma regra de negócio que pode precisar de ajustes
            const itemTotalNet = itemTotalGross.minus(fee); 

            console.log()

            newNetTotal = newNetTotal.plus(itemTotalNet);
        });

        // 5. Salva a Sacola Atualizada no Banco
        const updatedBag = await prisma.bag.update({
            where: {
                id: bagId
            },
            data: {
                // Serializa o array de volta para String antes de salvar
                items: JSON.stringify(items),
                // Converte os Decimals para String com 2 casas decimais
                total_gross_amount: newGrossTotal.toFixed(2),
                total_net_amount: newNetTotal.toFixed(2),
            },
        });

        // 6. Resposta de Sucesso
        return res.status(200).json({
            message: "Item removido e sacola recalculada com sucesso!",
            bag: updatedBag
        });

    } catch (error) {
        // Loga o erro completo para debug
        console.error('Erro ao deletar item da sacola:', error); 
        // Retorna uma resposta 500 para erro interno do servidor
        return res.status(500).json({
            message: "Ocorreu um erro interno ao processar a requisição."
        });
    }
});

// exclui produtos da loja
app.delete('/product/:id', async (req, res) => {

    try {
        const products = await prisma.product.delete({
            where: {
                id: req.params.id,
            },
        })
        res.status(200).json({ message: `Produto deletado` })

    } catch (err) {
        console.log(err)
        res.status(500).json({ message: `Não foi possível deletar produto cujo id é ${req.params.id}` })
    }

})

app.listen(3000)

// felipe
// 2OETXvxwBVRYrYPv