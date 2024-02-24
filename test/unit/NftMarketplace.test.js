const { assert, expect } = require("chai")
const { network, deployments, ethers } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")


!developmentChains.includes(network.name) ? describe.skip : describe("Nft Marketplace Tests", function() {
    let nftMarketplace,nftMarketplaceContract, basicNft, basicNftContract, deployer, user, accounts
    const PRICE = ethers.parseEther("0.1")
    const TOKEN_ID = 0
    beforeEach(async function() {
        accounts = await ethers.getSigners()
        deployer = accounts[0]
        user = accounts[1]
        await deployments.fixture(["all"])
        nftMarketplaceContract = await ethers.getContract("NftMarketplace")
        nftMarketplace = nftMarketplaceContract.connect(deployer)
        basicNftContract = await ethers.getContract("BasicNFT")
        basicNft = basicNftContract.connect(deployer)
        await basicNft.mintNft()
        await basicNft.approve(nftMarketplaceContract.target, TOKEN_ID)
    })

    describe("listItem", function(){
        it("emits an event after listing an item", async function() { 
            expect(await nftMarketplace.listItem(basicNft.target, TOKEN_ID, PRICE)).to.emit(nftMarketplace, "ItemListed")
        })
        it("exclusively items that haven't been listed", async function() {
            await nftMarketplace.listItem(basicNft.target, TOKEN_ID, PRICE)
            await expect(nftMarketplace.listItem(basicNft.target, TOKEN_ID, PRICE)).to.be.revertedWithCustomError(nftMarketplaceContract, "NftMarketplace__AlreadyListed")
        })
        it("exclusively allows owners to list", async function(){
            nftMarketplace = await nftMarketplaceContract.connect(user)
            await basicNft.approve(user.address, TOKEN_ID)
            await expect(nftMarketplace.listItem(basicNft.target, TOKEN_ID, PRICE)).to.be.revertedWithCustomError(nftMarketplaceContract, "NftMarketplace__NotOwner")

        })
        it("needs approvals to list item", async function() {
            await basicNft.approve(ethers.ZeroAddress, TOKEN_ID)
            await expect(nftMarketplace.listItem(basicNft.target, TOKEN_ID, PRICE)).to.be.revertedWithCustomError(nftMarketplaceContract, "NftMarketplace__NotApprovedForMarketplace")
        })
        it("Updates listing with seller and price", async function(){
            await nftMarketplace.listItem(basicNft.target, TOKEN_ID, PRICE)
            const listing = await nftMarketplace.getListing(basicNft.target, TOKEN_ID)
            assert(listing.price.toString() == PRICE.toString())
            assert(listing.seller.toString() == deployer.address)
        })
        it("reverts if the price be 0", async function() {
            const ZERO_PRICE = ethers.parseEther("0")
            await expect(nftMarketplace.listItem(basicNft.target, TOKEN_ID, ZERO_PRICE)).to.be.revertedWithCustomError(nftMarketplaceContract, "NftMarketplace__priceMustBeAboveZero")
        })
    })
    describe("buyItem", function() {
        it("reverts if the item isn't listed", async function(){
            await expect(nftMarketplace.buyItem(basicNft.target, TOKEN_ID)).to.be.revertedWithCustomError(nftMarketplaceContract, "NftMarketplace__NotListed")
        })
        it("reverts if the price isn't met", async function() {
            await nftMarketplace.listItem(basicNft.target, TOKEN_ID, PRICE)
            await expect(nftMarketplace.buyItem(basicNft.target, TOKEN_ID)).to.be.revertedWithCustomError(nftMarketplaceContract, "NftMarketplace__PriceNotMet")
        })
        it("transfers the NFT to the buyer and updates internal proceeds record", async function() {
            await nftMarketplace.listItem(basicNft.target, TOKEN_ID, PRICE)
            nftMarketplace = nftMarketplaceContract.connect(user)
            await expect (nftMarketplace.buyItem(basicNft.target, TOKEN_ID, { value: PRICE })).to.emit(nftMarketplace,"ItemBought")
            const newOwner = await basicNft.ownerOf(TOKEN_ID)
            const deployerProceeds = await nftMarketplace.getProceeds(deployer.address)
            assert(newOwner.toString() == user.address)
            assert(deployerProceeds.toString() == PRICE.toString())  
        })
    })
    describe("cancelListing", function(){
        it("reverts if there is no listing", async function() {
            await expect(nftMarketplace.cancelListing(basicNft.target, TOKEN_ID)).to.be.revertedWithCustomError(nftMarketplaceContract, "NftMarketplace__NotListed")
        })
        it("reverts if someone who isn't the owner tries to call", async function(){
            await nftMarketplace.listItem(basicNft.target, TOKEN_ID, PRICE)
            nftMarketplace = nftMarketplaceContract.connect(user)
            await basicNft.approve(user.address, TOKEN_ID)
            await expect(nftMarketplace.cancelListing(basicNft.target, TOKEN_ID)).to.be.revertedWithCustomError(nftMarketplace,"NftMarketplace__NotOwner")
        })
        it("emits event and removes lsiting", async function() {
            await nftMarketplace.listItem(basicNft.target, TOKEN_ID, PRICE)
            expect(await nftMarketplace.cancelListing(basicNft.target, TOKEN_ID)).to.emit(nftMarketplace,"ItemCanceled")
            const listing = await nftMarketplace.getListing(basicNft.target, TOKEN_ID)
            assert(listing.price.toString() == "0")
        })
    })
    describe("updateListing", function(){
        it("must be owner and listed", async function() {
            await expect(nftMarketplace.updateListing(basicNft.target, TOKEN_ID, PRICE)).to.be.revertedWithCustomError(nftMarketplace,"NftMarketplace__NotListed")
            await nftMarketplace.listItem(basicNft.target, TOKEN_ID, PRICE)
            nftMarketplace = nftMarketplaceContract.connect(user)
            await expect(nftMarketplace.updateListing(basicNft.target, TOKEN_ID, PRICE)).to.be.revertedWithCustomError(nftMarketplace,"NftMarketplace__NotOwner")
        })
        it("reverts if new price is 0", async function(){
            const updatePrice = ethers.parseEther("0")
            await nftMarketplace.listItem(basicNft.target, TOKEN_ID, PRICE)
            await expect(nftMarketplace.updateListing(basicNft.target, TOKEN_ID, updatePrice)).to.be.revertedWithCustomError(nftMarketplace,"NftMarketplace__priceMustBeAboveZero")
        })
        it("updates the price of the item", async function() {
            const updatePrice = ethers.parseEther("0.2")
            await nftMarketplace.listItem(basicNft.target, TOKEN_ID, PRICE)
            await expect(nftMarketplace.updateListing(basicNft.target, TOKEN_ID, updatePrice)).to.emit(nftMarketplace,"ItemListed")
            const listing = await nftMarketplace.getListing(basicNft.target, TOKEN_ID)
            assert(listing.price.toString() == updatePrice.toString())
        })
    })
    describe("withdrawProceeds", function(){
        it("doesn't allow 0 proceed withdrawls", async function(){
            await expect(nftMarketplace.withdrawProceeds()).to.be.revertedWithCustomError(nftMarketplace,"NftMarketplace__NoProceeds")
        })
        it("withdraws proceeds", async function(){
            await nftMarketplace.listItem(basicNft.target, TOKEN_ID, PRICE)
            nftMarketplace = nftMarketplaceContract.connect(user)
            await nftMarketplace.buyItem(basicNft.target, TOKEN_ID, { value: PRICE})
            nftMarketplace = nftMarketplaceContract.connect(deployer)

            const deployerProceedsBefore = await nftMarketplace.getProceeds(deployer.address)
            const deployerBalanceBefore = await ethers.provider.getBalance(deployer.address)
            const txResponse = await nftMarketplace.withdrawProceeds()
            const transactionReceipt = await txResponse.wait(1)
            const { gasUsed, gasPrice } = transactionReceipt
            const gasCost = gasUsed * gasPrice
            const deployerBalanceAfter = await ethers.provider.getBalance(deployer.address)

            assert((deployerBalanceAfter + gasCost).toString() == (deployerProceedsBefore + deployerBalanceBefore).toString())
        })
    })
})