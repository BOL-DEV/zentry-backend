import { catchAsync } from "../utils/catchAsync";
import { createGalleryItemSchema } from "../validations/gallery.schema";
import { organizerSlugParamSchema } from "../validations/organizer.schema";
import Organizer from "../models/organizer";
import { AppError } from "../utils/appError";
import Gallery from "../models/gallery";





export const createGalleryItem = catchAsync(async (req, res, next) => {
    const { slug } = organizerSlugParamSchema.parse(req.params)
    const data = createGalleryItemSchema.parse(req.body)

    const organizer = await Organizer.findOne({ slug }).select("_id slug")

    if (!organizer) {
        return next(new AppError("Organizer not found", 404))
    }

    

const galleryItem = await Gallery.create({
    organizerId: organizer._id,
    imageUrl: data.imageUrl,
    caption: data.caption || '',
    altText: data.altText || '',
    displayOrder: data.displayOrder || 0 ,
})

    res.status(201).json({
        status: "success",
        data: {
            galleryItem,
        },
    })

})